import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { AuthProvider, SignInCancelled, type Auth } from "../src/auth/context";
import { SignInScreen } from "../src/screens/SignInScreen";

function fakeAuth(overrides: Partial<Auth> = {}): Auth {
  return {
    status: "signedOut",
    methods: ["apple", "google"],
    signIn: jest.fn(async () => {}),
    signOut: jest.fn(async () => {}),
    ...overrides,
  };
}

async function renderWith(auth: Auth) {
  await render(
    <AuthProvider auth={auth}>
      <SignInScreen />
    </AuthProvider>,
  );
}

test("shows a button per available method and signs in with it", async () => {
  const auth = fakeAuth();
  await renderWith(auth);

  await fireEvent.press(screen.getByTestId("sign-in-google"));

  await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith("google"));
  expect(screen.getByTestId("sign-in-apple")).toBeTruthy();
});

test("hides methods the device doesn't offer", async () => {
  await renderWith(fakeAuth({ methods: ["google"] }));

  expect(screen.queryByTestId("sign-in-apple")).toBeNull();
  expect(screen.getByTestId("sign-in-google")).toBeTruthy();
});

test("a failed sign-in shows an error", async () => {
  await renderWith(fakeAuth({ signIn: jest.fn(async () => Promise.reject(new Error("boom"))) }));

  await fireEvent.press(screen.getByTestId("sign-in-google"));

  expect(await screen.findByRole("alert")).toHaveTextContent(/Sign-in failed/);
});

test("cancelling the sign-in sheet is not an error", async () => {
  const signIn = jest.fn(async () => Promise.reject(new SignInCancelled()));
  await renderWith(fakeAuth({ signIn }));

  await fireEvent.press(screen.getByTestId("sign-in-google"));

  await waitFor(() => expect(signIn).toHaveBeenCalled());
  expect(screen.queryByRole("alert")).toBeNull();
});
