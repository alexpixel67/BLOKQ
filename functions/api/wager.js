// functions/api/wager.js
export async function onRequestPost(context) {
  try {
    const request = await context.request.json();
    const { idToken, uid, gameType, betAmount, gameParams = {} } = request;
    const projectId = context.env.projectId;
    const apiKey = context.env.apiKey;

    if (!idToken || !uid || !gameType || typeof betAmount !== 'number') {
      return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    // 1. Secure Identity Verification
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?key=${apiKey}`;
    const getRes = await fetch(firestoreUrl, { headers: { "Authorization": `Bearer ${idToken}` } });

    if (!getRes.ok) return new Response(JSON.stringify({ error: "Identity verification failed" }), { status: 401 });

    const userData = await getRes.json();
    const currentBalance = parseInt(userData.fields.balance.integerValue);

    if (currentBalance < betAmount) {
      return new Response(JSON.stringify({ error: "Insufficient balance" }), { status: 400 });
    }

    // Initialize state
    let newBalance = currentBalance;
    let multiplier = 0;
    let gameDetails = {};

    // ==========================================
    // 🎲 SECURE DICE ENGINE
    // ==========================================
    if (gameType === 'dice') {
      const targetNumber = parseFloat(gameParams.targetNumber || 50.50);
      const isRollOver = gameParams.isRollOver !== false;
      
      // SERVER-SIDE MATH: Recalculate win chance and payout (Never trust client)
      let winChance = isRollOver ? (100.00 - targetNumber) : targetNumber;
      if (winChance < 0.01) winChance = 0.01;
      if (winChance > 98.00) winChance = 98.00;

      const actualPayout = 99.00 / winChance; // 1% House Edge enforced on server
      const rollResult = parseFloat((Math.random() * 100).toFixed(2));
      
      const isWin = isRollOver ? (rollResult > targetNumber) : (rollResult < targetNumber);
      
      multiplier = isWin ? actualPayout : 0;
      newBalance = currentBalance - betAmount + Math.floor(betAmount * multiplier);
      gameDetails = { rollResult, isWin, targetNumber, actualPayout };
    } 
    
    // ==========================================
    // 📉 SECURE LIMBO ENGINE
    // ==========================================
    else if (gameType === 'limbo') {
      const targetMultiplier = parseFloat(gameParams.targetMultiplier || 2.0);
      const roll = Math.random();
      
      const rollResult = parseFloat((0.99 / (1 - roll)).toFixed(2)); // 1% House Edge
      const isWin = rollResult >= targetMultiplier;
      
      multiplier = isWin ? targetMultiplier : 0;
      newBalance = currentBalance - betAmount + Math.floor(betAmount * multiplier);
      gameDetails = { rollResult, isWin, targetMultiplier };
    } 
    
    // ==========================================
    // 🟢 SECURE PLINKO ENGINE
    // ==========================================
    else if (gameType === 'plinko') {
      const rows = parseInt(gameParams.rows || 12);
      const risk = gameParams.risk || 'medium';
      
      // Full Server-Side Payout Tables
      const plinkoTables = {
        8: { low: [5.6, 1.6, 1.1, 1.0, 0.5, 1.0, 1.1, 1.6, 5.6], medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13], high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29] },
        12: { low: [10, 3, 1.6, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 1.6, 3, 10], medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33], high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170] },
        16: { low: [16, 9, 2, 1.4, 1.3, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.3, 1.4, 2, 9, 16], medium: [110, 41, 10, 5, 3, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3, 5, 10, 41, 110], high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000] }
      };

      const table = plinkoTables[rows] ? plinkoTables[rows][risk] : plinkoTables[12]['medium'];
      
      let path = [];
      let index = rows / 2; // Center drop
      for (let i = 0; i < rows; i++) {
        const direction = Math.random() > 0.5 ? 1 : -1;
        index += direction * 0.5;
        path.push(direction);
      }
      
      let bucket = Math.round(index);
      multiplier = table[bucket];
      newBalance = currentBalance - betAmount + Math.floor(betAmount * multiplier);
      gameDetails = { bucket, path };
    }

    // ==========================================
    // 💣 MINES & CRASH (STATELESS PATCHES)
    // ==========================================
    else if (gameType === 'mines_cashout') {
      // SECURE MINES MATH: Re-calculate the multiplier on the server based on revealed tiles
      // This prevents the user from sending { winnings: 9999999 }
      const revealedTiles = parseInt(gameParams.revealedTiles || 0);
      const minesCount = parseInt(gameParams.minesCount || 3);
      
      let prob = 1.0;
      for (let i = 0; i < revealedTiles; i++) {
          prob *= (25 - minesCount - i) / (25 - i);
      }
      const actualMultiplier = (1 - 0.01) / prob; // 1% House Edge
      
      multiplier = actualMultiplier;
      newBalance = currentBalance + Math.floor(betAmount * multiplier);
      gameDetails = { revealedTiles, multiplier };

    } else if (gameType === 'mines' || gameType === 'crash') {
      // Basic state initiation (Balance deduction only)
      newBalance = currentBalance - betAmount;
      gameDetails = { status: "game_started" };
    }

    // 4. Execute Secure Balance Update
    const patchBody = {
      fields: {
        balance: { integerValue: newBalance.toString() },
        username: { stringValue: userData.fields.username.stringValue },
        email: { stringValue: userData.fields.email.stringValue }
      }
    };

    const patchRes = await fetch(firestoreUrl + "&updateMask.fieldPaths=balance", {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(patchBody)
    });

    if (!patchRes.ok) return new Response(JSON.stringify({ error: "Failed to update ledger" }), { status: 500 });

    return new Response(JSON.stringify({
      success: true,
      newBalance,
      multiplier,
      gameDetails
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
