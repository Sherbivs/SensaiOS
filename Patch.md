Alright — we’ll wire your new **publicLog** directly into Discord’s messaging layer so that when battles or effects occur (flinch, status, fainting, etc.), those events automatically post to your bot’s battle channel.

Here’s the clean, safe integration plan and patch outline:

---

### ✅ Goal

Each turn, your engine pushes human-readable messages into `ctx.publicLog`.
After the turn resolves, your Discord command handler (e.g., `/battle`, `/turn`, `/fight`) picks them up and sends them as embeds or plain messages.

---

### 🔧 Implementation

```diff
diff --git a/src/commands/battle-turn.js b/src/commands/battle-turn.js
index 2b8a4e9..9dd41bc 100644
--- a/src/commands/battle-turn.js
+++ b/src/commands/battle-turn.js
@@ -24,7 +24,28 @@ module.exports = {
   async execute(interaction) {
     const ctx = {
       rng: makeRNG(Date.now()),
       log: [],
-      publicLog: []
+      publicLog: []
     };
 
     const state = loadBattleState(interaction.user.id);
     const actions = parseActions(interaction.options);
     await resolveTurn(state, actions.a, actions.b, ctx);
+
+    // --- Public battle log broadcasting ---
+    if (ctx.publicLog && ctx.publicLog.length > 0) {
+      const embed = {
+        title: 'Battle Log',
+        description: ctx.publicLog.join('\n'),
+        color: 0xE0A000,
+        footer: { text: `Turn completed • ${new Date().toLocaleTimeString()}` }
+      };
+      try {
+        await interaction.followUp({ embeds: [embed] });
+      } catch (err) {
+        console.error('Battle log send failed:', err);
+      }
+    }
+
+    // Developer log (optional verbose output)
+    console.debug('[BATTLE LOG]', ctx.log);
   }
 };
```

---

### 💡 Why this is ideal

* Keeps **engine code decoupled** from Discord — all messaging happens in the command layer.
* **No risk** of triggering rate limits; it posts once per turn.
* Compatible with **embeds or plain text**; can easily expand to show HP bars or icons later.

---

### 🧩 Optional polish

If you want to add rich formatting later:

* Prefix special events (flinch, burn, faint, crit) with emojis.
* Color-code by team (red vs blue).
* Include HP/Status thumbnails per Pokémon.

---

Once this patch is live, every `ctx.publicLog.push()` (like flinch, critical hit, or KO) will automatically appear in Discord after each turn.

Would you like me to extend this a bit further to include **HP and status summaries** (like “Charizard 72/160 HP 🔥 [BRN]”) at the bottom of each embed?
