import uuid
from collections.abc import Callable

from fastapi.testclient import TestClient

from kwamz_core.songs import SongId

from .conftest import FakeGenerator, User


def create(client: TestClient, user: User, seed: SongId, parent: str | None = None) -> dict:
    body: dict = {"seed_song_id": str(seed)}
    if parent:
        body["parent_radio_id"] = parent
    response = client.post("/radios", headers=user.headers, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def track_ids(radio: dict) -> list[str]:
    return [t["song"]["id"] for t in radio["tracks"]]


def test_create_radio_with_generator(client: TestClient, user: User, catalog: list[SongId]) -> None:
    radio = create(client, user, catalog[0])

    assert radio["seed_song"]["id"] == str(catalog[0])
    assert radio["model_version"] == "fake-1"
    assert radio["seed_strategy"] == "direct"
    assert radio["parent_radio_id"] is None
    assert [t["position"] for t in radio["tracks"]] == list(range(20))
    assert str(catalog[0]) not in track_ids(radio)  # seed excluded
    assert len(set(track_ids(radio))) == 20


def test_radio_is_saved_and_replayable(
    client: TestClient, user: User, catalog: list[SongId]
) -> None:
    radio = create(client, user, catalog[0])

    assert client.get(f"/radios/{radio['id']}", headers=user.headers).json() == radio
    assert client.get("/radios", headers=user.headers).json() == [radio]


def test_banned_songs_are_excluded(client: TestClient, user: User, catalog: list[SongId]) -> None:
    for song in catalog[1:4]:
        assert client.put(f"/bans/{song}", headers=user.headers).status_code == 204

    radio = create(client, user, catalog[0])
    assert not {str(s) for s in catalog[1:4]} & set(track_ids(radio))


def test_keep_going_continues_without_repeats(
    client: TestClient, user: User, catalog: list[SongId]
) -> None:
    first = create(client, user, catalog[0])
    second = create(client, user, catalog[0], parent=first["id"])

    assert second["parent_radio_id"] == first["id"]
    assert len(second["tracks"]) == 20
    assert not set(track_ids(first)) & set(track_ids(second))

    # The original radio is untouched.
    assert client.get(f"/radios/{first['id']}", headers=user.headers).json() == first


def test_users_only_see_their_own_radios(
    client: TestClient, new_user: Callable[[], User], catalog: list[SongId]
) -> None:
    alice, bob = new_user(), new_user()
    radio = create(client, alice, catalog[0])

    assert client.get("/radios", headers=bob.headers).json() == []
    assert client.get(f"/radios/{radio['id']}", headers=bob.headers).status_code == 404
    keep_going = client.post(
        "/radios",
        headers=bob.headers,
        json={"seed_song_id": str(catalog[0]), "parent_radio_id": radio["id"]},
    )
    assert keep_going.status_code == 404


def test_unknown_seed_is_404(client: TestClient, user: User) -> None:
    response = client.post(
        "/radios", headers=user.headers, json={"seed_song_id": str(uuid.uuid4())}
    )
    assert response.status_code == 404


def test_no_generator_configured_is_503(
    make_client: Callable[..., TestClient], user: User, catalog: list[SongId]
) -> None:
    client = make_client(generator=None, settings={"radio_generator": ""})
    response = client.post("/radios", headers=user.headers, json={"seed_song_id": str(catalog[0])})
    assert response.status_code == 503


def test_short_radio_is_503_and_not_saved(
    client: TestClient, user: User, catalog: list[SongId], generator: FakeGenerator
) -> None:
    for output in ([], list(catalog[1:20])):  # nothing; 19 songs
        generator.override = lambda _exclude, out=output: out
        response = client.post(
            "/radios", headers=user.headers, json={"seed_song_id": str(catalog[0])}
        )
        assert response.status_code == 503
    assert client.get("/radios", headers=user.headers).json() == []


def test_keep_going_that_runs_out_is_503(
    client: TestClient, user: User, catalog: list[SongId]
) -> None:
    # 50-song catalog minus the seed minus 40 already played leaves 9.
    first = create(client, user, catalog[0])
    second = create(client, user, catalog[0], parent=first["id"])
    third = client.post(
        "/radios",
        headers=user.headers,
        json={"seed_song_id": str(catalog[0]), "parent_radio_id": second["id"]},
    )
    assert third.status_code == 503
    assert len(client.get("/radios", headers=user.headers).json()) == 2


def test_invalid_generator_output_is_rejected(
    make_client: Callable[..., TestClient],
    user: User,
    catalog: list[SongId],
    generator: FakeGenerator,
) -> None:
    client = make_client(raise_server_exceptions=False)
    bad_outputs = [
        lambda _e: [catalog[1], catalog[1]],  # duplicate
        lambda _e: list(catalog[1:22]),  # 21 tracks
        lambda _e: [catalog[0]],  # the seed itself
    ]
    for output in bad_outputs:
        generator.override = output
        response = client.post(
            "/radios", headers=user.headers, json={"seed_song_id": str(catalog[0])}
        )
        assert response.status_code == 500
    assert client.get("/radios", headers=user.headers).json() == []


def test_dummy_generator_is_the_default(
    make_client: Callable[..., TestClient], user: User, catalog: list[SongId]
) -> None:
    client = make_client(generator=None)  # RADIO_GENERATOR defaults to "dummy"
    seed = client.get("/search", params={"q": "m83"}, headers=user.headers).json()["songs"][0]

    radio = create(client, user, seed["id"])
    assert radio["model_version"] == "dummy-v1"
    assert len(radio["tracks"]) == 20
    # The stubbed catalog has one other M83 song; the rest is filled from known songs.
    assert radio["tracks"][0]["song"]["title"] == "Wait"


def test_tracks_show_the_users_own_likes_and_bans(
    client: TestClient, new_user: Callable[[], User], catalog: list[SongId]
) -> None:
    owner, other = new_user(), new_user()
    radio = create(client, owner, catalog[0])
    liked, banned = radio["tracks"][0]["song"]["id"], radio["tracks"][1]["song"]["id"]
    assert client.put(f"/likes/{liked}", headers=owner.headers).status_code == 204
    assert client.put(f"/bans/{banned}", headers=owner.headers).status_code == 204
    assert client.put(f"/likes/{banned}", headers=other.headers).status_code == 204

    tracks = client.get(f"/radios/{radio['id']}", headers=owner.headers).json()["tracks"]

    flags = {t["song"]["id"]: (t["liked"], t["banned"]) for t in tracks}
    assert flags[liked] == (True, False)
    assert flags[banned] == (False, True)  # another user's like doesn't show
    assert all(f == (False, False) for s, f in flags.items() if s not in {liked, banned})
    assert [t["song"]["id"] for t in tracks] == track_ids(radio)  # order is unchanged
