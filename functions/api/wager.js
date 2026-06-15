// functions/api/wager.js
export async function onRequestPost(context) {
  try {
    const { idToken, uid, gameType, betAmount } = await context.request.json();
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
    }

    // 3. Compute new balance
    // For Crash, calculation is handled after client session finishes, but Plinko/RNG resolve immediately.
    let newBalance = currentBalance - betAmount;
    if (gameType !== 'crash') {
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
