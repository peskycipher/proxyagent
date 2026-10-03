/**
 * Pod-control backend selection: the REST client whose getPod/startPod/stopPod
 * the lifecycle layer talks to. "direct" + a configured vast instance uses the
 * vast client; everything else uses Runpod.
 */

import * as runpod from "@/lib/runpod";
import * as vast from "@/lib/vast";

const backend = () => (vast.configured() ? vast : runpod);

export const getPod = () => backend().getPod();
export const startPod = () => backend().startPod();
export const stopPod = () => backend().stopPod();
export const isConflict = (e: unknown) => backend().isConflict(e);
export const llamaHealthy = () => backend().llamaHealthy();