export const LIMBO_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
export const SLOT_NAMES = ['top', 'upper right', 'lower right', 'bottom', 'lower left', 'upper left'];

const ARC_BULGE = 0.28;

function isKeyPixel(r, g, b) {
    return (r + g + b > 450 && Math.max(r, g, b) - Math.min(r, g, b) < 60);
}

function isGlowPixel(r, g, b) {
    return (r > 150 && r - b > 50 && g > 150);
}

function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function getPlayArea(W, H) {
    return {
        x0: Math.round(W * 0.08),
        x1: Math.round(W * 0.92),
        y0: Math.round(H * 0.17),
        y1: Math.round(H * 0.92)
    };
}

export function limboColorName(r, g, b) {
    const max_c = Math.max(r, g, b);
    const min_c = Math.min(r, g, b);
    if (max_c < 90 || max_c - min_c < 70) return null;

    const delta = max_c - min_c;
    let hue;
    if (max_c === r) {
        hue = ((g - b) / delta + 6) % 6;
    } else if (max_c === g) {
        hue = (b - r) / delta + 2;
    } else {
        hue = (r - g) / delta + 4;
    }
    hue *= 60;

    if (hue < 15 || hue >= 330) return 'red';
    if (hue < 38) return 'orange';
    if (hue < 70) return 'yellow';
    if (hue < 170) return 'green';
    if (hue < 250) return 'blue';
    return 'purple';
}

export function limboBlobs(data, W, H) {
    const { x0, x1, y0, y1 } = getPlayArea(W, H);
    const mask = new Uint8Array(W * H);
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = (y * W + x) * 4;
            if (isKeyPixel(data[i], data[i + 1], data[i + 2])) mask[y * W + x] = 1;
        }
    }

    const min_pixels = Math.max(6, Math.round(W * H * 0.0007));
    const blobs = [];
    const stack = [];
    for (let start = 0; start < mask.length; start++) {
        if (mask[start] !== 1) continue;
        let count = 0;
        let sum_x = 0;
        let sum_y = 0;
        mask[start] = 2;
        stack.push(start);
        while (stack.length > 0) {
            const p = stack.pop();
            const px = p % W;
            const py = (p - px) / W;
            count++;
            sum_x += px;
            sum_y += py;
            for (const q of [p - 1, p + 1, p - W, p + W]) {
                if (q < 0 || q >= mask.length || mask[q] !== 1) continue;
                if (Math.abs((q % W) - px) > 1) continue;
                mask[q] = 2;
                stack.push(q);
            }
        }
        if (count >= min_pixels) {
            blobs.push({ x: sum_x / count, y: sum_y / count, n: count });
        }
    }
    return blobs;
}

function countColourPixels(data, W, H) {
    const { x0, x1, y0, y1 } = getPlayArea(W, H);
    let count = 0;
    for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
            const i = (y * W + x) * 4;
            if (limboColorName(data[i], data[i + 1], data[i + 2])) count++;
        }
    }
    return count;
}

function orderSlots(blobs) {
    let center_x = 0;
    let center_y = 0;
    for (const blob of blobs) {
        center_x += blob.x;
        center_y += blob.y;
    }
    center_x /= blobs.length;
    center_y /= blobs.length;

    const angleOf = (blob) => (Math.atan2(blob.x - center_x, -(blob.y - center_y)) + 2 * Math.PI + Math.PI / 6) % (2 * Math.PI);
    const sorted = blobs.slice().sort((a, b) => angleOf(a) - angleOf(b));

    const slots = [];
    for (const blob of sorted) {
        slots.push({ x: blob.x, y: blob.y });
    }
    return slots;
}

function getPairings(items) {
    if (items.length === 0) return [[]];
    const first = items[0];
    const rest = items.slice(1);
    const result = [];
    for (let j = 0; j < rest.length; j++) {
        const others = [];
        for (let k = 0; k < rest.length; k++) {
            if (k !== j) others.push(rest[k]);
        }
        for (const sub_pairing of getPairings(others)) {
            result.push([[first, rest[j]], ...sub_pairing]);
        }
    }
    return result;
}

function getArcPoint(A, B, t, side) {
    const mid_x = (A.x + B.x) / 2;
    const mid_y = (A.y + B.y) / 2;
    const half_x = (B.x - A.x) / 2;
    const half_y = (B.y - A.y) / 2;
    const u = -Math.cos(Math.PI * t);
    const v = side * ARC_BULGE * Math.sin(Math.PI * t) ** 2;
    return {
        x: mid_x + u * half_x - v * half_y,
        y: mid_y + u * half_y + v * half_x
    };
}

function getPairingCost(pairs, slots, move_frames) {
    const frame_count = move_frames.length;
    let total_cost = 0;
    for (const [a, b] of pairs) {
        const A = slots[a];
        const B = slots[b];
        let best = Infinity;
        for (const side of [1, -1]) {
            let cost = 0;
            for (let k = 0; k < frame_count; k++) {
                const blobs = move_frames[k];
                const t = (k + 1) / (frame_count + 1);
                const expected = [getArcPoint(A, B, t, side), getArcPoint(B, A, t, side)];
                for (const point of expected) {
                    let nearest = Infinity;
                    for (const blob of blobs) {
                        nearest = Math.min(nearest, dist(blob, point));
                    }
                    cost += nearest;
                }
            }
            best = Math.min(best, cost);
        }
        total_cost += best;
    }
    return total_cost;
}

export function solveLimbo(frames, W, H, startOverride = null) {
    if (frames.length === 0) return { ok: false, reason: 'no frames' };
    const unit = Math.min(W, H);
    const tolerance = unit * 0.025;

    const colour_counts = [];
    let colour_max = -Infinity;
    for (const frame of frames) {
        const count = countColourPixels(frame.data, W, H);
        colour_counts.push(count);
        colour_max = Math.max(colour_max, count);
    }

    let reveal_frame = -1;
    if (colour_max > 40) {
        reveal_frame = frames.length - 1;
        while (reveal_frame > 0 && colour_counts[reveal_frame - 1] > colour_max * 0.5) {
            reveal_frame--;
        }
    }
    const last_shuffle = (reveal_frame >= 0) ? reveal_frame : frames.length;

    const frame_blobs = [];
    for (let f = 0; f < last_shuffle; f++) {
        frame_blobs.push(limboBlobs(frames[f].data, W, H));
    }

    let first_rest = -1;
    for (let f = 0; f < frame_blobs.length; f++) {
        if (frame_blobs[f].length === 6) {
            first_rest = f;
            break;
        }
    }
    if (first_rest < 0) return { ok: false, reason: 'could not find the six keys — is this a Limbo GIF?' };
    const slots = orderSlots(frame_blobs[first_rest]);

    const isAtSlot = (blobs, slot) => {
        for (const blob of blobs) {
            if (dist(blob, slot) <= tolerance) return true;
        }
        return false;
    };
    const isRestFrame = (blobs) => {
        if (blobs.length !== 6) return false;
        for (const slot of slots) {
            if (!isAtSlot(blobs, slot)) return false;
        }
        return true;
    };

    let first_move = frame_blobs.length;
    for (let f = first_rest + 1; f < frame_blobs.length; f++) {
        if (!isRestFrame(frame_blobs[f])) {
            first_move = f;
            break;
        }
    }

    const glow_counts = new Array(6).fill(0);
    const radius = unit * 0.1;
    for (let f = 0; f < Math.max(first_move, 1); f++) {
        const data = frames[f].data;
        for (let k = 0; k < slots.length; k++) {
            const slot = slots[k];
            let count = 0;
            for (let y = Math.max(0, Math.round(slot.y - radius)); y < Math.min(H, slot.y + radius); y++) {
                for (let x = Math.max(0, Math.round(slot.x - radius)); x < Math.min(W, slot.x + radius); x++) {
                    const j = (y * W + x) * 4;
                    if (isGlowPixel(data[j], data[j + 1], data[j + 2])) count++;
                }
            }
            glow_counts[k] = Math.max(glow_counts[k], count);
        }
    }

    const glow_order = [];
    for (let k = 0; k < glow_counts.length; k++) {
        glow_order.push([glow_counts[k], k]);
    }
    glow_order.sort((a, b) => b[0] - a[0]);
    const detected_start = (glow_order[0][0] > 0) ? glow_order[0][1] : null;
    const start_sure = (detected_start !== null && glow_order[0][0] > 3 * (glow_order[1][0] + 5));
    const start = (startOverride !== null && startOverride !== undefined) ? startOverride : detected_start;

    const moves = [];
    let f = first_rest;
    while (f < frame_blobs.length) {
        if (isRestFrame(frame_blobs[f])) {
            f++;
            continue;
        }
        const move_start = f;
        while (f < frame_blobs.length && !isRestFrame(frame_blobs[f])) f++;
        const move_frames = frame_blobs.slice(move_start, f);

        const moved_slots = [];
        for (let k = 0; k < slots.length; k++) {
            let off_count = 0;
            for (const blobs of move_frames) {
                if (!isAtSlot(blobs, slots[k])) off_count++;
            }
            if (off_count * 2 >= move_frames.length && off_count > 0) moved_slots.push(k);
        }

        const move = { frames: [move_start, f - 1], pairs: [], cost: 0, margin: Infinity, warn: '' };
        if (moved_slots.length < 2 || moved_slots.length % 2 !== 0) {
            move.warn = `${moved_slots.length} key(s) moved — expected pairs`;
        } else {
            const scored = [];
            for (const pairing of getPairings(moved_slots)) {
                scored.push({ p: pairing, c: getPairingCost(pairing, slots, move_frames) });
            }
            scored.sort((a, b) => a.c - b.c);
            const scale = move_frames.length * moved_slots.length * unit;
            move.pairs = scored[0].p;
            move.cost = scored[0].c / scale;
            move.margin = (scored.length > 1) ? (scored[1].c - scored[0].c) / scale : Infinity;
        }
        moves.push(move);
    }

    const path = [];
    let current_slot = start;
    if (current_slot !== null) {
        for (const move of moves) {
            for (const [a, b] of move.pairs) {
                if (current_slot === a) {
                    current_slot = b;
                } else if (current_slot === b) {
                    current_slot = a;
                }
            }
            path.push(current_slot);
        }
    }

    let colors = null;
    if (reveal_frame >= 0) {
        const data = frames[reveal_frame].data;
        colors = [];
        for (const slot of slots) {
            const votes = {};
            for (let y = Math.max(0, Math.round(slot.y - radius)); y < Math.min(H, slot.y + radius); y++) {
                for (let x = Math.max(0, Math.round(slot.x - radius)); x < Math.min(W, slot.x + radius); x++) {
                    const j = (y * W + x) * 4;
                    const name = limboColorName(data[j], data[j + 1], data[j + 2]);
                    if (name) votes[name] = (votes[name] || 0) + 1;
                }
            }
            let best_name = null;
            let best_count = 0;
            for (const [name, count] of Object.entries(votes)) {
                if (count > best_count) {
                    best_name = name;
                    best_count = count;
                }
            }
            colors.push(best_name);
        }
    }

    let unsure_moves = 0;
    for (const move of moves) {
        if (move.warn || move.margin < 0.01) unsure_moves++;
    }

    return {
        ok: true,
        slots,
        start,
        detectedStart: detected_start,
        startSure: start_sure,
        moves,
        unsureMoves: unsure_moves,
        path,
        end: current_slot,
        colors,
        revealFrame: reveal_frame,
        answer: (current_slot !== null && colors && colors[current_slot]) ? colors[current_slot] : ''
    };
}
