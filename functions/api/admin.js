// functions/api/admin.js
export async function onRequestPost(context) {
  try {
    const request = await context.request.json();
    const idToken = request.idToken;
    const action = request.action;
    const projectId = context.env.projectId;
    const apiKey = context.env.apiKey;

    if (!idToken || !action) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    // 1. Verify the user's identity using Firebase Admin SDK approach
    // Decode and verify the ID token
    const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`;
    
    const verifyRes = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: idToken })
    });

    if (!verifyRes.ok) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 401 });
    }

    const verifyData = await verifyRes.json();
    
    if (!verifyData.users || verifyData.users.length === 0) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
    }

    const user = verifyData.users[0];
    const uid = user.localId;

    // 2. Check if user has admin role in Firestore
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?key=${apiKey}`;
    
    const userRes = await fetch(firestoreUrl, {
      headers: { "Authorization": `Bearer ${idToken}` }
    });

    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch user data" }), { status: 500 });
    }

    const userData = await userRes.json();
    const userRole = userData.fields?.role?.stringValue;

    if (userRole !== 'admin') {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403 });
    }

    // 3. Process admin actions
    let result;

    if (action === 'addGame' || action === 'updateGame') {
      const gameData = request.gameData;
      
      if (!gameData || !gameData.title || !gameData.page) {
        return new Response(JSON.stringify({ error: "Invalid game data" }), { status: 400 });
      }

      const gamesCollectionUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/games?key=${apiKey}`;

      if (action === 'addGame') {
        // Add new game
        const documentData = {
          fields: {
            title: { stringValue: gameData.title },
            page: { stringValue: gameData.page },
            emoji: { stringValue: gameData.emoji || '🎮' },
            category: { stringValue: gameData.category || 'originals' },
            image: { stringValue: gameData.image || '' },
            createdAt: { timestampValue: new Date().toISOString() },
            updatedAt: { timestampValue: new Date().toISOString() }
          }
        };

        const addRes = await fetch(gamesCollectionUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${idToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(documentData)
        });

        if (!addRes.ok) {
          return new Response(JSON.stringify({ error: "Failed to add game" }), { status: 500 });
        }

        const addedDoc = await addRes.json();
        result = { success: true, gameId: addedDoc.name.split('/').pop(), message: "Game added successfully" };

      } else {
        // Update existing game
        const gameId = gameData.id;
        
        if (!gameId) {
          return new Response(JSON.stringify({ error: "Game ID required for update" }), { status: 400 });
        }

        const updateUrl = `${gamesCollectionUrl}/${gameId}?key=${apiKey}&updateMask.fieldPaths=title&updateMask.fieldPaths=page&updateMask.fieldPaths=emoji&updateMask.fieldPaths=category&updateMask.fieldPaths=image&updateMask.fieldPaths=updatedAt`;

        const updateData = {
          fields: {
            title: { stringValue: gameData.title },
            page: { stringValue: gameData.page },
            emoji: { stringValue: gameData.emoji || '🎮' },
            category: { stringValue: gameData.category || 'originals' },
            image: { stringValue: gameData.image || '' },
            updatedAt: { timestampValue: new Date().toISOString() }
          }
        };

        const updateRes = await fetch(updateUrl, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${idToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(updateData)
        });

        if (!updateRes.ok) {
          return new Response(JSON.stringify({ error: "Failed to update game" }), { status: 500 });
        }

        result = { success: true, message: "Game updated successfully" };
      }

    } else if (action === 'deleteGame') {
      const gameId = request.gameId;
      
      if (!gameId) {
        return new Response(JSON.stringify({ error: "Game ID required" }), { status: 400 });
      }

      const deleteUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/games/${gameId}?key=${apiKey}`;

      const deleteRes = await fetch(deleteUrl, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${idToken}`
        }
      });

      if (!deleteRes.ok) {
        return new Response(JSON.stringify({ error: "Failed to delete game" }), { status: 500 });
      }

      result = { success: true, message: "Game deleted successfully" };

    } else if (action === 'getGames') {
      // Fetch all games
      const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;

      const queryBody = {
        structuredQuery: {
          from: [{ collectionId: "games" }],
          orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }]
        }
      };

      const queryRes = await fetch(queryUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(queryBody)
      });

      if (!queryRes.ok) {
        return new Response(JSON.stringify({ error: "Failed to fetch games" }), { status: 500 });
      }

      const queryData = await queryRes.json();
      const games = [];

      if (Array.isArray(queryData)) {
        for (const item of queryData) {
          if (item.document) {
            const doc = item.document;
            const fields = doc.fields || {};
            games.push({
              id: doc.name.split('/').pop(),
              title: fields.title?.stringValue || '',
              page: fields.page?.stringValue || '',
              emoji: fields.emoji?.stringValue || '🎮',
              category: fields.category?.stringValue || '',
              image: fields.image?.stringValue || '',
              createdAt: fields.createdAt?.timestampValue,
              updatedAt: fields.updatedAt?.timestampValue
            });
          }
        }
      }

      result = { success: true, games };

    } else if (action === 'getUser') {
      // Get specific user data (admin only)
      const targetUid = request.targetUid;
      
      if (!targetUid) {
        return new Response(JSON.stringify({ error: "Target user ID required" }), { status: 400 });
      }

      const targetUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${targetUid}?key=${apiKey}`;

      const targetRes = await fetch(targetUrl, {
        headers: {
          "Authorization": `Bearer ${idToken}`
        }
      });

      if (!targetRes.ok) {
        return new Response(JSON.stringify({ error: "Failed to fetch user data" }), { status: 500 });
      }

      const targetData = await targetRes.json();
      
      if (targetData.fields) {
        result = { 
          success: true, 
          user: {
            uid: targetUid,
            username: targetData.fields.username?.stringValue || '',
            email: targetData.fields.email?.stringValue || '',
            balance: parseInt(targetData.fields.balance?.integerValue || 0),
            role: targetData.fields.role?.stringValue || 'user'
          }
        };
      } else {
        result = { success: true, user: null };
      }

    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
    }

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
