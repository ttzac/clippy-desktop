import { sleeping } from './ambient';
import { talking, thinking } from './ai';
import { curious, dragging, happy, shocked } from './interaction';
import type { StateDef } from '../StateMachine';

/** Register new states here. */
export const ALL_STATES: StateDef[] = [curious, happy, shocked, dragging, thinking, talking, sleeping];
export const STATE_IDS = ALL_STATES.filter((s) => s.id !== 'dragging').map((s) => s.id);
