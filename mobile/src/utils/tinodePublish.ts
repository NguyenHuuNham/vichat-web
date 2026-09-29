export function publishSequence(result: any) {
  return Number(
    result?.params?.seq
      || result?.ctrl?.params?.seq
      || result?.seq
      || result?.ctrl?.seq,
  ) || 0;
}
