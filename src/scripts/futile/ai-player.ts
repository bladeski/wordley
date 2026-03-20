import type { Futile } from './futile';
import type { Tile } from './shared';

export class AIPlayer {
  idx: number;
  constructor(idx: number) {
    this.idx = idx;
  }

  async takeTurn(game: Futile) {
    // Simple heuristic AI:
    // 1. Try to create a meld from hand (largest set or any run >=3)
    // 2. Try to add to an existing meld
    // 3. Otherwise, pass lowest tile

    // per-move randomized delay ranges (ms) by difficulty
    const difficulty = (game as any).difficulty || 'medium';
    const [minMs, maxMs] =
      difficulty === 'easy' ? [3000, 5000] : difficulty === 'hard' ? [1500, 2500] : [2000, 4000];
    const moveDelayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    // split into an initial pause and shorter in-turn pauses
    const initialDelay = Math.max(300, Math.round(moveDelayMs * 0.5));
    const shortDelay = Math.max(150, Math.round(moveDelayMs * 0.25));
    await new Promise((r) => setTimeout(r, initialDelay));

    const hand = game.players[this.idx].hand.slice();

    // Evaluate best direct play: largest set and largest run in hand
    const byNum = new Map<number, Tile[]>();
    for (const t of hand) {
      const arr = byNum.get(t.number) || [];
      arr.push(t);
      byNum.set(t.number, arr);
    }
    const sets = Array.from(byNum.values()).filter((g) => g.length >= 3);
    let bestSet: Tile[] | null = null;
    if (sets.length > 0) {
      sets.sort((a, b) => b.length - a.length);
      bestSet = sets[0];
    }

    const byColour = new Map<string, Tile[]>();
    for (const t of hand) {
      const arr = byColour.get(t.colour) || [];
      arr.push(t);
      byColour.set(t.colour, arr);
    }
    let bestRun: Tile[] | null = null;
    for (const group of byColour.values()) {
      if (group.length < 3) continue;
      const nums = group.map((t) => t.number).sort((a, b) => a - b);
      let run: Tile[] = [];
      const byNumMap = new Map(group.map((t) => [t.number, t] as [number, Tile]));
      for (let i = 0; i < nums.length; i++) {
        const n = nums[i];
        const seq: Tile[] = [];
        let cur = n;
        while (byNumMap.has(cur)) {
          seq.push(byNumMap.get(cur)!);
          cur++;
        }
        if (seq.length >= 3 && seq.length > run.length) run = seq;
      }
      if (run.length >= 3 && (!bestRun || run.length > bestRun.length)) bestRun = run;
    }

    // Determine best direct play (type and tiles)
    const bestDirectLen = Math.max(bestSet ? bestSet.length : 0, bestRun ? bestRun.length : 0);
    const bestDirectType: 'set' | 'run' | null = bestRun && (!bestSet || bestRun.length > (bestSet?.length || 0)) ? 'run' : bestSet ? 'set' : null;
    const bestDirectTiles = bestDirectType === 'run' ? bestRun : bestDirectType === 'set' ? bestSet : null;

    // Hard mode: check whether stealing a tile first would enable a larger play than bestDirect
    if (difficulty === 'hard') {
      let stealSucceeded = false;
      for (let owner = 0; owner < game.players.length && !stealSucceeded; owner++) {
        if (owner === this.idx) continue;
        const p = game.players[owner];
        // if AI has no tiles in hand, it cannot perform steals requiring hand tiles
        if (game.players[this.idx].hand.length === 0) continue;
        for (let mi = 0; mi < p.playedMelds.length && !stealSucceeded; mi++) {
          const sourceMeld = p.playedMelds[mi];
          for (const stolen of sourceMeld) {
            // hypothetical hand after steal
            const tempHand = hand.concat([stolen]);

            // evaluate best set in tempHand
            const tmpByNum = new Map<number, Tile[]>();
            for (const t of tempHand) {
              const arr = tmpByNum.get(t.number) || [];
              arr.push(t);
              tmpByNum.set(t.number, arr);
            }
            const tmpSets = Array.from(tmpByNum.values()).filter((g) => g.length >= 3);
            let tmpBestSetLen = 0;
            let tmpBestSetNum: number | null = null;
            if (tmpSets.length > 0) {
              tmpSets.sort((a, b) => b.length - a.length);
              tmpBestSetLen = tmpSets[0].length;
              tmpBestSetNum = tmpSets[0][0].number;
            }

            // evaluate best run in tempHand
            const tmpByColour = new Map<string, Tile[]>();
            for (const t of tempHand) {
              const arr = tmpByColour.get(t.colour) || [];
              arr.push(t);
              tmpByColour.set(t.colour, arr);
            }
            let tmpBestRunLen = 0;
            let tmpBestRunInfo: { colour: string; nums: number[] } | null = null;
            for (const group of tmpByColour.values()) {
              if (group.length < 3) continue;
              const nums = group.map((t) => t.number).sort((a, b) => a - b);
              const byNumMap = new Map(group.map((t) => [t.number, t] as [number, Tile]));
              for (let i = 0; i < nums.length; i++) {
                const n = nums[i];
                const seq: number[] = [];
                let cur = n;
                while (byNumMap.has(cur)) {
                  seq.push(cur);
                  cur++;
                }
                if (seq.length >= 3 && seq.length > tmpBestRunLen) {
                  tmpBestRunLen = seq.length;
                  tmpBestRunInfo = { colour: group[0].colour, nums: seq };
                }
              }
            }

            const tmpBestCombined = Math.max(tmpBestSetLen, tmpBestRunLen);
            if (tmpBestCombined > bestDirectLen) {
              // ensure stealing this tile won't invalidate the source meld
              const remainingAfterSteal = sourceMeld.filter((t) => t.id !== stolen.id);
              if (remainingAfterSteal.length > 0 && !(game.isSet(remainingAfterSteal) || game.isRun(remainingAfterSteal))) {
                continue;
              }
              // attempt to steal 'stolen' and create the combined meld
              // ensure AI still has at least one hand tile before selecting
              if (game.players[this.idx].hand.length === 0) continue;
              // build selection of hand tiles required (exclude stolen which is in source meld)
              (game as any).clearSelectedMeldSelections();
              (game as any).selectedMeldInstanceKeys.add(`${owner}|${mi}|${stolen.id}`);
              (game as any).syncSelectedMeldIdsFromInstances();
              game.selectedIds.clear();

              if (tmpBestRunLen > tmpBestSetLen && tmpBestRunInfo) {
                // select hand tiles from the live player's hand matching run numbers (exclude stolen)
                const liveHand = game.players[this.idx].hand;
                for (const n of tmpBestRunInfo.nums) {
                  if (stolen.colour === tmpBestRunInfo.colour && stolen.number === n) continue;
                  const found = liveHand.find((t) => t.colour === tmpBestRunInfo!.colour && t.number === n && !game.selectedIds.has(t.id));
                  if (found) game.selectedIds.add(found.id);
                }
              } else if (tmpBestSetNum !== null) {
                // select hand tiles matching set number from the live hand
                const liveHand = game.players[this.idx].hand;
                for (const t of liveHand) {
                  if (t.number === tmpBestSetNum) game.selectedIds.add(t.id);
                }
              }

              try {
                const before = game.players[this.idx].playedMelds.length;
                // indicate which source meld we are stealing from
                game.selectedMeldSourceOwner = owner;
                game.selectedMeldSourceMeldIdx = mi;
                await (game as any).stealCreate();
                const after = game.players[this.idx].playedMelds.length;
                if (after > before) {
                  stealSucceeded = true;
                  game.players[this.idx].markHasPlayedMeld();
                  await new Promise((r) => setTimeout(r, shortDelay));
                  // don't end the turn yet — let AI continue with further adds
                }
              } catch {
                // ignore and continue searching
              }
            }
          }
        }
      }
      if (stealSucceeded) {
        // recompute hand and continue with add-to-meld logic below
      }
    }

    // If no beneficial steal (or not hard), perform the best direct play if any
    if (bestDirectTiles && bestDirectTiles.length >= 3) {
      if (bestDirectType === 'set') {
        const pick = bestDirectTiles;
        const added = await game.players[this.idx].addMeld(pick);
        (game as any).clearSelectedMeldSelections();
        if (added) {
          for (const t of pick) game.players[this.idx].removeTileById(t.id);
          game.players[this.idx].markHasPlayedMeld();
          game.checkForWin();
        }
        await new Promise((r) => setTimeout(r, shortDelay));
        const remaining = game.players[this.idx].hand;
        const passTile = remaining.length ? remaining[0] : null;
        if (passTile) {
          game.selectedIds.clear();
          game.selectedIds.add(passTile.id);
        }
        await game.endTurn();
        return;
      } else if (bestDirectType === 'run') {
        const run = bestDirectTiles;
        const added = await game.players[this.idx].addMeld(run);
        if (added) {
          for (const t of run) game.players[this.idx].removeTileById(t.id);
          game.players[this.idx].markHasPlayedMeld();
          game.checkForWin();
        }
        await new Promise((r) => setTimeout(r, shortDelay));
        const remaining = game.players[this.idx].hand;
        const passTile = remaining.length ? remaining[0] : null;
        if (passTile) {
          game.selectedIds.clear();
          game.selectedIds.add(passTile.id);
        }
        await game.endTurn();
        return;
      }
    }

    // try to add to existing melds (own or others) using valid subsets
    // only attempt adding if this AI has played a meld previously
    if (!game.players[this.idx].hasPlayedMeld) {
      // skip add attempts until AI has at least one played meld
    } else if (difficulty === 'easy') {
      // easy mode: do not attempt add/steal actions
    } else {
      // hard mode: try a simple steal heuristic first
      if (difficulty === 'hard') {
        const handTiles = game.players[this.idx].hand.slice();
        for (let owner = 0; owner < game.players.length; owner++) {
          if (owner === this.idx) continue;
          const p = game.players[owner];
          for (let mi = 0; mi < p.playedMelds.length; mi++) {
            const sourceMeld = p.playedMelds[mi];
            for (const stolen of sourceMeld) {
              // skip stealing if it would leave source meld invalid
              const remainingAfter = sourceMeld.filter((t) => t.id !== stolen.id);
              if (remainingAfter.length > 0 && !(game.isSet(remainingAfter) || game.isRun(remainingAfter))) continue;
              for (const h of handTiles) {
                const candidate = [stolen, h];
                if (game.isSet(candidate) || game.isRun(candidate)) {
                  // select stolen tile and one hand tile and attempt stealCreate
                  (game as any).clearSelectedMeldSelections();
                  (game as any).selectedMeldInstanceKeys.add(`${owner}|${mi}|${stolen.id}`);
                  (game as any).syncSelectedMeldIdsFromInstances();
                  game.selectedIds.clear();
                  game.selectedIds.add(h.id);
                  game.selectedMeldSourceOwner = owner;
                  game.selectedMeldSourceMeldIdx = mi;
                  try {
                    const before = game.players[this.idx].playedMelds.length;
                    await (game as any).stealCreate();
                    const after = game.players[this.idx].playedMelds.length;
                    if (after > before) {
                      // successful steal — mark and end turn
                      game.players[this.idx].markHasPlayedMeld();
                      await new Promise((r) => setTimeout(r, shortDelay));
                      const remaining = game.players[this.idx].hand;
                      const passTile = remaining.length ? remaining[0] : null;
                      if (passTile) {
                        game.selectedIds.clear();
                        game.selectedIds.add(passTile.id);
                      }
                      await game.endTurn();
                      return;
                    }
                  } catch {
                    // ignore and continue
                  }
                }
              }
            }
          }
        }
      }
      for (let owner = 0; owner < game.players.length; owner++) {
        const p = game.players[owner];
        for (let mi = 0; mi < p.playedMelds.length; mi++) {
          const dest = p.playedMelds[mi];
          if (!dest || dest.length === 0) continue;
          const dstIsSet = game.isSet(dest);
          const dstIsRun = game.isRun(dest);

          if (dstIsSet) {
            const num = dest[0].number;
            // select one or more tiles from hand matching the set number
            const candidates = game.players[this.idx].hand.filter((t) => t.number === num);
            if (candidates.length > 0) {
              // choose up to all matching tiles
              const toAdd = candidates; // all matching tiles
              // set selections and call game's addToMeld to apply the same validation
              game.selectedIds.clear();
              toAdd.forEach((t) => game.selectedIds.add(t.id));
              (game as any).clearSelectedMeldSelections();
              game.selectedMeldDestOwner = owner;
              game.selectedMeldDestMeldIdx = mi;
              // debug
              // attempting addToMeld owner/mi
              const ok = await game.addToMeld(owner, mi);
              // addToMeld result recorded
              await new Promise((r) => setTimeout(r, shortDelay));
              if (ok) {
                // after a successful add, keep attempting further actions
                continue;
              }
              // failed - clear selection and continue searching
              game.selectedIds.clear();
              (game as any).clearSelectedMeldSelections();
              game.selectedMeldDestOwner = null;
              game.selectedMeldDestMeldIdx = null;
            }
          } else if (dstIsRun) {
            const colour = dest[0].colour;
            const handSameColour = game.players[this.idx].hand.filter((t) => t.colour === colour);
            if (handSameColour.length === 0) continue;

            const existingNums = Array.from(new Set(dest.map((t) => t.number))).sort((a, b) => a - b);
            let min = existingNums[0];
            let max = existingNums[existingNums.length - 1];

            const candidateNumsSet = new Set(handSameColour.map((t) => t.number));
            const candidateNums = Array.from(candidateNumsSet).sort((a, b) => a - b);

            // First, try to fill any internal gaps between min..max
            const requiredWithin: number[] = [];
            for (let n = min; n <= max; n++) if (!existingNums.includes(n)) requiredWithin.push(n);

            const toSelectNums: number[] = [];
            const missingSatisfied = requiredWithin.every((n) => candidateNumsSet.has(n));
            if (missingSatisfied && requiredWithin.length > 0) {
              toSelectNums.push(...requiredWithin);
            }

            // If no internal gaps to fill, try to extend to the right then left as far as possible
            if (toSelectNums.length === 0) {
              // extend right
              let cur = max + 1;
              while (candidateNumsSet.has(cur)) {
                toSelectNums.push(cur);
                cur++;
              }
              // extend left
              cur = min - 1;
              while (candidateNumsSet.has(cur)) {
                toSelectNums.push(cur);
                cur--;
              }
            }

            if (toSelectNums.length === 0) continue;

            // verify combined numbers form consecutive sequence
            const combinedSet = new Set(existingNums.concat(toSelectNums));
            const combinedNums = Array.from(combinedSet).sort((a, b) => a - b);
            const cmin = combinedNums[0];
            const cmax = combinedNums[combinedNums.length - 1];
            if (cmax - cmin + 1 !== combinedNums.length) {
              // not consecutive after selection — skip
              continue;
            }

            // pick actual tile objects from hand for selected numbers
            const toAddTiles: Tile[] = [];
            const handMap = new Map<number, Tile[]>();
            for (const t of handSameColour) {
              const arr = handMap.get(t.number) || [];
              arr.push(t);
              handMap.set(t.number, arr);
            }
            let enough = true;
            for (const n of toSelectNums) {
              const arr = handMap.get(n);
              if (!arr || arr.length === 0) {
                enough = false;
                break;
              }
              toAddTiles.push(arr[0]);
              // consume one
              arr.shift();
            }
            if (!enough || toAddTiles.length === 0) continue;

            // set selections and call game.addToMeld to apply central validation & effects
            game.selectedIds.clear();
            toAddTiles.forEach((t) => game.selectedIds.add(t.id));
            (game as any).clearSelectedMeldSelections();
            game.selectedMeldDestOwner = owner;
            game.selectedMeldDestMeldIdx = mi;
            // debug
            // attempting addToMeld (run) owner/mi
            const ok = await game.addToMeld(owner, mi);
            // addToMeld (run) result recorded
            await new Promise((r) => setTimeout(r, shortDelay));
            if (ok) {
              // after a successful add, keep attempting further actions
              continue;
            }
            game.selectedIds.clear();
            (game as any).clearSelectedMeldSelections();
            game.selectedMeldDestOwner = null;
            game.selectedMeldDestMeldIdx = null;
          }
        }
      }
    }

    // If we reached here the AI hasn't taken another action — pass the lowest tile.
    const remaining = game.players[this.idx].hand;
    const passTile = remaining.length ? remaining[0] : null;
    if (passTile) {
      game.selectedIds.clear();
      game.selectedIds.add(passTile.id);
    }
    await game.endTurn();
    // debug (visible)
    // AI takeTurn end
  }
}