import type { DetectRequest } from "./types";
import { detect } from "./detect";

self.onmessage = (event: MessageEvent<DetectRequest>) => {
  const { data, width, height } = event.data;
  const result = detect(data, width, height);
  self.postMessage(result);
};
