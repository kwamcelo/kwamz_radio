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
    assert not set(track_ids(first)) & set(track_ids(second))
    # 30-song catalog minus seed minus 20 used: the generator runs out after 9.
    assert len(second["tracks"]) == 9

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
    client = make_client(generator=None)
    response = client.post("/radios", headers=user.headers, json={"seed_song_id": str(catalog[0])})
    assert response.status_code == 503


def test_generator_returning_nothing_is_503(
    client: TestClient, user: User, catalog: list[SongId], generator: FakeGenerator
) -> None:
    generator.override = lambda _exclude: []
    response = client.post("/radios", headers=user.headers, json={"seed_song_id": str(catalog[0])})
    assert response.status_code == 503


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
