// Keeping the spin on the song's beat. Pure, so it is tested in Node.
const TURN = 2 * Math.PI;
export const BPM = 150;                       // the tempo of "OIIA OIIA"
export const BEATS_PER_SECOND = BPM / 60;     // a speed of this many turns a second is one turn per beat
const JUMP = 0.5, SETTLE = 0.05, LOCK = 3;    // JUMP: seconds off that count as a seek; LOCK: how fast the spin catches up, per second

// YouTube's getCurrentTime only changes when the player reports in, a few times a second, and a reading that old is a
// large part of a turn. So the clock counts only readings that changed, and reads the song's time from their offset
// from the local clock. We only see a new reading on the next frame, so a reading can be late but never early: the
// offset takes any that is ahead of it, and only settles slowly toward one behind it. A reading far off it is a seek
// or a loop, and lands at once. reset() forgets it all, for when the song stops: it may come back later than it left.
export function songClock() {
  let last = null, offset = null;
  return {
    read(t, now) {
      if (t !== last) {
        last = t;
        const o = t - now;
        if (offset === null || o > offset || offset - o > JUMP) offset = o;
        else offset += (o - offset) * SETTLE;
      }
      return now + offset;
    },
    reset() { last = offset = null; },
  };
}

// The spin's angle at song time t: whole turns fall on beat0, the time of a beat.
export const songAngle = (t, speed, beat0 = 0) => TURN * speed * (t - beat0);

// How far angle is from target, the short way round one turn, in [−π, π). The spin only has to agree within a turn, so
// a seek never makes it whirl through the rest of the three-turn loop.
export const phaseError = (angle, target) => {
  const d = (target - angle) % TURN;
  return ((d + 1.5 * TURN) % TURN) - TURN / 2;
};

// The part of the error to take up over a frame of dt seconds.
export const lockStep = (error, dt) => error * (1 - Math.exp(-dt * LOCK));
