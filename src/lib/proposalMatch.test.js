
// The overall % after a call transcript adds concerns. This path used to carry
// the pre-call number over untouched, so the board's document showed a fit that
// described the proposal before the call happened.
import { overallFromConcerns } from './proposalMatch.js';

describe('overallFromConcerns', () => {
  it('is the mean of the concern fits', () => {
    expect(overallFromConcerns([{ fit: 90 }, { fit: 70 }])).toBe(80);
  });

  it('rises when a call adds stronger concerns than the thin first match', () => {
    // The demo shape: two concerns from a one-line form answer, then six more
    // from the discovery call.
    const before = [{ fit: 92 }, { fit: 58 }];
    const after = [...before, { fit: 88 }, { fit: 90 }, { fit: 85 }, { fit: 82 }, { fit: 91 }, { fit: 78 }];
    expect(overallFromConcerns(before)).toBe(75);
    expect(overallFromConcerns(after)).toBe(83);
  });

  it('can fall, honestly, when what the call added fits worse', () => {
    expect(overallFromConcerns([{ fit: 95 }])).toBe(95);
    expect(overallFromConcerns([{ fit: 95 }, { fit: 25 }])).toBe(60);
  });

  it('ignores concerns a CAM has toggled off', () => {
    // Same rule `scores` uses — a removed concern must not drag the fit down.
    expect(overallFromConcerns([{ fit: 90 }, { fit: 20, on: false }])).toBe(90);
  });

  it('is 0 with nothing to average, and never leaves 0-100', () => {
    expect(overallFromConcerns([])).toBe(0);
    expect(overallFromConcerns()).toBe(0);
    expect(overallFromConcerns([{ fit: 400 }])).toBe(100);
    expect(overallFromConcerns([{ fit: -5 }])).toBe(0);
    expect(overallFromConcerns([{}])).toBe(0);
  });
});
