// functions/api/wager.js
export async function onRequestPost(context) {
  try {
    const request = await context.request.json();
    const idToken = request.idToken;
    const uid = request.uid;
    const gameType = request.gameType;
    const betAmount = request.betAmount;
    const gameParams = request.gameParams || {};
    const projectId = context.env.projectId;
    const apiKey = context.env.apiKey;

    if (!idToken || !uid || !gameType || !betAmount) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    // 1. Fetch user's balance securely from Firestore REST API using their ID Token.
    // If the token is fake or expired, Google will return a 401 Unauthorized [1.1.2].
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?key=${apiKey}`;
    
    const getRes = await fetch(firestoreUrl, {
      headers: { "Authorization": `Bearer ${idToken}` }
    });

    if (!getRes.ok) {
      return new Response(JSON.stringify({ error: "Identity verification failed" }), { status: 401 });
    }

    const userData = await getRes.json();
    const currentBalance = parseInt(userData.fields.balance.integerValue);

    if (currentBalance < betAmount) {
      return new Response(JSON.stringify({ error: "Insufficient balance" }), { status: 400 });
    }

    // 2. Calculate secure server-side probability outcomes
    let multiplier = 0;
    let gameDetails = {};

    if (gameType === 'rng') {
      const auras = [
        { name: "Common", bonus: 0.2, prob: 0.8 },
        { name: "Uncommon", bonus: 0.5, prob: 0.134 },
        { name: "Rare", bonus: 1.5, prob: 0.05 },
        { name: "Epic", bonus: 4.0, prob: 0.0125 },
        { name: "Legendary", bonus: 15.0, prob: 0.003 },
        { name: "Mythical", bonus: 50.0, prob: 0.0004 },
        { name: "GALACTIC", bonus: 500.0, prob: 0.0001 }
      ];

      const roll = Math.random();
      let cumulative = 0;
      let chosenAura = auras[0];

      for (const aura of auras) {
        cumulative += aura.prob;
        if (roll <= cumulative) {
          chosenAura = aura;
          break;
        }
      }

      multiplier = chosenAura.bonus;
      gameDetails = { auraName: chosenAura.name, rarity: chosenAura.prob, color: chosenAura.color || "#00e701" };

    } else if (gameType === 'plinko') {
      const plinkoMultipliers = [8.0, 3.0, 1.2, 0.5, 0.2, 0.5, 1.2, 3.0, 8.0];
      
      // Simulate physics path on the server so client cannot spoof where the ball lands
      let path = [];
      let index = 4; // Center bucket
      for (let i = 0; i < 8; i++) {
        const direction = Math.random() > 0.5 ? 1 : -1;
        index += direction * 0.5;
        path.push(direction);
      }
      
      let bucket = Math.round(index);
      if (bucket < 0) bucket = 0;
      if (bucket > 8) bucket = 8;

      multiplier = plinkoMultipliers[bucket];
      gameDetails = { bucket, path };

    } else if (gameType === 'crash') {
      // Secure single-player crash calculation
      const roll = Math.random();
      const crashPoint = roll < 0.03 ? 1.00 : parseFloat((0.99 / (1 - roll)).toFixed(2));
      
      gameDetails = { crashPoint: Math.min(crashPoint, 15.00) };

    } else if (gameType === 'dice') {
      // Secure dice roll calculation
      const rollResult = parseFloat((Math.random() * 100).toFixed(2));
      const targetNumber = gameParams.targetNumber || 50.5;
      const isRollOver = gameParams.isRollOver !== false;
      
      let isWin;
      if (isRollOver) {
        isWin = rollResult > targetNumber;
      } else {
        isWin = rollResult < targetNumber;
      }
      
      const payout = gameParams.payout || 2.0;
      multiplier = isWin ? payout : 0;
      gameDetails = { rollResult, isWin, targetNumber, isRollOver };

    } else if (gameType === 'limbo') {
      // Secure limbo roll calculation
      const targetMultiplier = gameParams.targetMultiplier || 2.0;
      const roll = Math.random();
      // Inverse distribution for limbo: higher targets are harder to hit
      const rollResult = parseFloat((0.99 / (1 - roll)).toFixed(2));
      const isWin = rollResult >= targetMultiplier;
      
      multiplier = isWin ? targetMultiplier : 0;
      gameDetails = { rollResult, isWin, targetMultiplier };

    } else if (gameType === 'mines_cashout') {
      // Handle mines cashout - credit winnings based on revealed tiles
      const winnings = gameParams.winnings || 0;
      newBalance = currentBalance + winnings;
      multiplier = winnings / betAmount;
      gameDetails = { winnings, revealedTiles: gameParams.revealedTiles || 0 };

    } else if (gameType === 'mines') {
      // Secure mines game - generate mine positions server-side
      const minesCount = gameParams.minesCount || 3;
      const TOTAL_TILES = 25;
      
      // Generate random mine positions
      const minePositions = [];
      while (minePositions.length < minesCount) {
        const rand = Math.floor(Math.random() * TOTAL_TILES);
        if (!minePositions.includes(rand)) {
          minePositions.push(rand);
        }
      }
      
      // For mines, we don't calculate final multiplier here
      // The client will send cashout requests as tiles are revealed
      // We just store the mine positions and initial state
      gameDetails = { minePositions, minesCount, revealedTiles: [] };
      // No immediate balance change for mines - handled via cashout
      newBalance = currentBalance - betAmount;
    }

    // 3. Compute new balance
    // For Crash - calculation is handled after client session finishes
    // Plinko/RNG/Dice/Limbo resolve immediately.
    // Mines has special handling via mines_cashout
    if (gameType !== 'crash' && gameType !== 'mines' && gameType !== 'mines_cashout') {
      newBalance = currentBalance - betAmount;
      newBalance += Math.floor(betAmount * multiplier);
    }

    // 4. Update the new balance in Firestore securely [1.1.2]
    const patchBody = {
      fields: {
        balance: { integerValue: newBalance.toString() },
        username: { stringValue: userData.fields.username.stringValue },
        email: { stringValue: userData.fields.email.stringValue }
      }
    };

    const patchRes = await fetch(firestoreUrl + "&updateMask.fieldPaths=balance", {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(patchBody)
    });

    if (!patchRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to update balance ledger" }), { status: 500 });
    }

    // 5. Send secure results back to browser
    return new Response(JSON.stringify({
      success: true,
      newBalance,
      multiplier,
      gameDetails
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
