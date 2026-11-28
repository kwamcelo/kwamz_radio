import { useRouter } from "expo-router";

import { useAuth } from "../auth/context";
import { SearchScreen } from "../screens/SearchScreen";

export default function SearchRoute() {
  const router = useRouter();
  const auth = useAuth();
  return (
    <SearchScreen
      onOpenRadio={(id) => router.push({ pathname: "/radio/[id]", params: { id } })}
      onSignOut={() => auth.signOut()}
    />
  );
}
