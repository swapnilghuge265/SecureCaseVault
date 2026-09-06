"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

export default function SessionDate({
  date,
}: {
  date: string;
}) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    return <>—</>;
  }

  return <>{new Date(date).toLocaleString()}</>;
}