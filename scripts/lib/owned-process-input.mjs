// Windows Docker stdin needs its pipe closed after the queued bytes are flushed.
export function finishOwnedInput(stream, input) {
  stream.on("error", () => {});
  stream.end(input, () => stream.destroy());
}
