import { useLocalSearchParams, useRouter } from "expo-router";

import { RadioScreen } from "../../screens/RadioScreen";

export default function RadioRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RadioScreen
      radioId={id}
      onBack={() => router.back()}
      onOpenRadio={(next) => router.push({ pathname: "/radio/[id]", params: { id: next } })}
    />
  );
}
