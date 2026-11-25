# Changelog

Newest first. Dates are when the work was committed. Both games also show a short changelog for
players under About → CHANGELOG: Heist's in `src/heist/heistMarkup.html` (its v1.27 is this
session's), the bomb app's in `src/core/bombChangelog.js`. Add a line there when a change ships.

## 2026-11-25 — Conso's Mines: the 16-mine total; modules checked against the guide

- **Asked:** "conso's mines are not working, copy my logic into that".
- **Cause:** conso's Mines already runs this app's reader and solver (`window.BombLogic.mines`), but
  its last commit has the logic from 24 Nov 12:11, before the 16-mine total. On the 24 Nov end board
  (J7, or else J5 and J8) the committed copy finds no safe square; this app finds J5 and J8.
  - The port (the total passed to the solver, "safe only because the board has 16 mines" note,
    "can't hold 16 mines" warning, mines stat as n/16) was in conso's working copy, uncommitted.
  - `bomb-logic.js` rebuilt; the only other change is the module-name table (Wires, Memory, Echo,
    Bluescreen implemented).
  - Checked on the guide's real Helper Mines picture: both apps read the same board and give the
    same 13 safe squares and 9 mines. Conso's built site does the same from an upload; a paste there
    is caught by its guest gate (login prompt), which is by design.
- **Guide check of the existing modules:** Hangman, Complex Wires, Knobs, Simon, Logic, Search,
  Morse, Who's on First, Queens and Wire Sequences match it. Left as they are, pending the user:
  Diagram (guide: a serial vowel → the unshaded region; the rule was removed 24 Nov), Circuit (guide:
  whole ohms; a fraction copies its decimal), Pipes (guide: anticlockwise; both are shown), Mines
  (the guide gives no total; 16 is the user's).
- Tests: `tests/minesGuide.test.js` reads `tests/fixtures/mines_guide.png` (the guide's picture)
  in node with a stub canvas and checks the board, safe squares and mines.
- `.gitignore`: `morse.gif` (a copy of `tests/fixtures/morse_cargo_reversed.gif`) and
  `public/manual_piano_solver.html` (a reference copy, like the other ignored ones).

## 2026-11-25 — Wires, Memory and Echo modules (from the field guide)

- **Asked:** "Make modules for everything that my bot doesn't have", from `bomb-defusal-guide.html`
  (a field guide to all 36 module types). Conso's app is left alone.
- **Missing were:** Wires, Memory, Echo, plus Breaker, The Eye and Pressure. The guide says the last
  three are needy and have **no Helper tab**. The Defuser handles them alone (flip Breaker ON before
  any answer; answer only the module the open Eye names; release Pressure once per fixed 30 s
  window), so there is nothing for a Helper page to look up. The needy reminder already counts the
  30 s marks.
- **No real manual text for the three:** the guide only describes them with one example each, so
  the parsers take many wordings and flag a line they don't understand. The Defuser's side is from
  real game art: the Wires (5 and 6 wires), Memory and Echo cards of the board pictures, cropped and
  scaled to the 440 px module size (`tests/fixtures/*_boardcrop.png`).
- **Wires** (`src/modules/wires/`):
  - Paste the manual once: its 3, 4, 5 and 6 wire lists. Headers like "3 wires:", "Three Wires",
    "4-wire" are understood. Rules like "If …, cut …", "Otherwise, cut …", "cut … if …" or
    "condition: cut …", numbered or bulleted.
  - Conditions: no / exactly / more than / at least / at most N colour wires; the first / last / Nth
    wire is (not) a colour; more X than Y wires. Serial conditions go through the Button checklist's
    parser (last digit odd, vowel, …).
  - Cuts: the Nth / last wire, the first / last / Nth colour wire, wire N.
  - The first rule that is true wins. A rule that needs the serial blocks with "NEED: SERIAL" only
    when every rule above it is false.
  - The picture: the grey caps at each wire's top give the wires, left → right. Along each wire, the
    pixel least like the panel is classed red / yellow / blue / white / black, and they vote.
    Black wires are told from the panel by being neutral grey (the panel is blue-grey).
  - Each wire can be changed by hand; colours can be added.
- **Memory** (`src/modules/memory/`):
  - The manual's 20 rules, one per stage and display: a position ("the second position"), a label
    ("labeled 4"), or the position / label pressed in an earlier stage.
  - The picture: the green display digit, the four white labels, the five stage lights.
    Labels are read as a line (they must be 1–4 once each), else one by one; one unread label
    is the one missing. A lone "1" is told by its shape (OCR reads it as l).
  - Every press is remembered. Pasting the next stage's picture saves the stage just answered
    (only if the picture changed). There are ✓ pressed → next stage and ↶ back a stage buttons.
- **Echo** (`src/modules/echo/`):
  - The word list in any separator (→, ->, -, :, =, "to", tabs, several per line). Only the left
    side is looked up. A word that is only on the right says so ("CHACE is only on the right").
  - The picture: the light word in the middle, read as capitals.
  - A misread word is taken only when one left-hand word is clearly closest (1 letter off, 2 for 7+
    letters).
  - A stage log up to 10.
- Wires and Memory are no longer "shared" (one page for all copies): the guide says a bomb has at
  most one of each, and old missions with 2–3 copies get a window each, sharing the manual.
- New game clears the three manuals.
- **Checked in the browser:**
  - Wires: both pictures right, as PNG, as JPEG and at the board's own 268 px.
  - Memory: the real picture; 8 shuffled button orders with other display digits, PNG and JPEG.
    17 / 17 right.
  - Echo: the real CONGA, plus 12 words painted in two slab stand-in fonts, PNG and JPEG.
    25 / 25 right.
  - Each page with its sample manual and picture: Wires → 4th wire (red); Memory stage 2 →
    1st button (label 4); Echo → BRISK.
- `tests/wires.test.js`, `tests/memory.test.js`, `tests/echo.test.js`: 12 tests. `npm test`: 302 pass.

## 2026-11-25 — Bluescreen (needy) module

- **Asked:** a module that tells the Bluescreen answer. The user sent the manual (the same every
  game), the bot's crash message ("The screen crashed with error 8136. At the crash: 1 disarmed and
  7 armed modules …"; live ones are similar) and the crash picture (now
  `tests/fixtures/bluescreen_8136.png`).
- **The rules** (`src/modules/bluescreen/bluescreenSolver.js`):
  - Start with the sum of the digits, then apply every rule that is true: armed count even →
    + first digit, odd → − last digit; a vowel in the serial → + 4; the serial's last digit odd →
    − 2; more disarmed than armed → + third digit.
  - A total of 0 or below gets the disarmed count added until it is above 0. Then count that many
    disarmed modules in reading order, wrapping around → the k-th disarmed module.
  - With one disarmed module the answer is that one, whatever is still missing (the 8136 sample).
- **Inputs:**
  - The crash message, pasted as-is: it gives the error number, the disarmed and armed counts, and
    the serial if it names one. Other wordings work too ("Error number: 4021", "Disarmed: 3").
  - Or the crash picture: the blue screen is found by colour. The tall white digits in its lower half
    are the number; the solid squares of the code are left out. The line is read with the shared
    Tesseract pool (digits only), and digit by digit only when the line doesn't give four.
  - The serial comes from the top bar.
- **The answer:** "2nd disarmed" (the Defuser counts left → right, top → bottom, skipping armed
  ones). In a level the module names it: the level's board order goes to the module
  (`src/core/LevelContext.js`; a board-read level keeps every card it saw, the unsolvable ones too).
  The helper taps the modules disarmed at the crash. When the ticks match the disarmed count, the
  answer is the module's name ("Maze", or "Piano #2" when the bomb has two). The ticks stay between
  crashes until clear / New game; "↻ next crash" clears only the error and counts.
- Needy modules never count: Bluescreen and Breaker (both have a green light from the start on the
  board picture) are left out of the cards.
- Bluescreen is now a solvable module: a level read from a board picture includes it.
- **Checked:**
  - In the browser, the picture reads 8136. 32 more pictures with other numbers painted in the two
    slab stand-in fonts (Patua One, Aleo), half of them as JPEG: all read right.
  - The page with the sample, and with a 6-card level and 3 ticks (8136, AB3C7, 3 / 3 → total 14 →
    2nd disarmed = Maze), at desktop and phone width.
- `tests/bluescreen.test.js`: 6 tests (message wordings, every rule, wrapping at 0 and below, one
  disarmed, board cards, locating the digits in the picture). `npm test`: 290 pass.

## 2026-11-25 — Balance: the "HCl + Cu(OH)₂" picture reads, and a font stress test

- **Asked:** a Balance picture ("HCl + Cu(OH)₂ →" / "CuCl₂ + H₂O", wrapped, 440 px) that didn't read.
  "Please properly investigate balance ocr". It is now `tests/fixtures/balance_hcl_cuoh2_wrapped.png`.
- **Why that picture failed** (`src/modules/balance/balanceVision.js`, `balanceSolver.js`):
  - The touching "Cu" was cut inside the u. The serif rule in `splitTouching` took the bowl of "u"
    for the gap between two letters. Now it never cuts where the strokes on both sides start at
    lowercase height (two lowercase letters never touch in a formula); this also covers the arch of
    "n" in Mn / Zn.
  - The curled foot of "l" ran into the "₂" of "Cl₂". Subscript widening took it in, so it read "42".
    On the left, widening now only takes columns that start at the digit's own top or that cross
    two of its strokes.
  - "H20" after a subscript had no repair. `OCR_ALTERNATIVES` gained `0 → O`.
  - That fix first broke AlCl₃: "₃" with a foot glued on read "8" ("AlCl8 + Na8PO4", which
    balances). `fixDigitByLoops`: an "8" whose only loop closes through soft edge pixels is a "3".
- **Stress test:** the game's font isn't known. It looks like a soft slab serif (curled "l",
  pointed "A"). So I rendered 124 equations in the module's layout and read them back with the app's
  reader in headless Chromium:
  - 78 textbook equations, plus 46 built from the characters above (Cu, Zn, Mn, Mg, Hg, Sn, Cl₂ /
    Cl₃, brackets, Li / Ni / Si).
  - Fonts: Patua One and Aleo (the closest to the game's), plus Ubuntu and Atkinson Hyperlegible.
- **Results** (right / readings that balanced but were wrong):
  - On the 78 textbook equations, before the stress-test fixes → after:
    - Patua One: 69 / 4 → 78 / 0
    - Aleo: 70 / 4 → 78 / 0
    - Ubuntu: 65 / 6 → 78 / 0
    - Atkinson: 61 / 9 → 75 / 1
  - On all 124, at 440 px: Patua One 124 / 0, Aleo 124 / 0, Ubuntu 123 / 0, Atkinson 115 / 1.
  - On all 124, at ~760 px (the size of the new pictures): Patua One 124 / 0, Aleo 124 / 0.
  - Every other miss is shown as not balancing, so the player fixes the text. Atkinson's one wrong
    answer is its slashed zero read as 8, and the game font has no slashed zero.
- **Then 11 more game pictures** (8 new, at about 760 px; now `tests/fixtures/balance_mg_al2so43_wrapped`,
  `croh3_wrapped`, `li2o_hcl_wrapped`, `li_cl2`, `k_h2o`, `al2o3_h3po4_wrapped`, `nio_hcl_wrapped`,
  `alcl3_big2`):
  - 11 of 15 read right at first.
  - The other 4 read "H₂O" as "HgO". In this font, "₂O" touch through a column of soft edge
    pixels. The cut there gave that column to the left piece, so the "₂" got the O's whole faint
    left edge, looked as tall as a letter, and the new "g" rule took it.
  - The cut column now goes to neither piece.
  - The "g" rule now also needs the glyph to start by x-height (a subscript starts lower).
  - That moved the slab "Li" foot-piece merge to a 2 px gap.
  - The ~760 px test found more:
    - a bracket around one element is refused ("PbN(O3)2" tied with "Pb(NO₃)₂");
    - a count past 12 of anything but C / H / O is refused ("Al20O3");
    - a lowercase letter after a whole two-letter symbol starts the next one ("Srcl2" → "SrCl2"),
      except digit look-alikes ("Nas" = "Na₃" stays for the repair);
    - "Tr" / "Nr" → Ti / Ni.
  - All 15 Balance pictures read right.
- **Fixes the stress test found:**
  - **Dot of "i"** (Li / Ni / Si / Ti): a stem with a dot over it, an empty row between, is "i". A
    dot left on its own goes back on the stem under it. This applies only to a square-ish dot over
    a narrow stem standing on the baseline; a scrap of a letter's arm over "₄" had turned it into
    "i".
  - **"Cl" touching:** a round letter glued to a full-height stem, with no straight stem on its
    left, is "Cl" (it read "C" + a loop = "O": "HCl" → "HO", which balances).
  - **Slab "Li":** the L's foot runs into the i. The short piece cut off on the baseline goes back
    to the L; alone, it was a subscript "1".
  - **Letters:**
    - an x-height stroke on the baseline read as l / I is "r" (Cr);
    - a lowercase glyph hanging below the baseline read as 9 / 8 / s is "g" (Mg, Ag, Hg);
    - "z" is "2";
    - "I" before a lowercase letter only L takes is "L";
    - case pairs are fixed one at a time ("HCL" → "HCl").
  - **Subscripts:**
    - widening follows the diagonal of "₄" under an H's serif ("CH₄" read "CH1");
    - a closed loop across the split keeps a wide "₄" whole ("44");
    - specks of a neighbour's edge are dropped;
    - the cap line is measured from letters, not brackets (the "u" of "Cu(NO₃)₂" was taken for a
      subscript).
  - **Plausibility** (`readsBalanced`): OCR noise often balances, so a reading is only taken when
    it could be printed. It is refused when it has any of these:
    - a written subscript 1;
    - a count of 3+ digits, over 40, or starting with 0;
    - a coefficient over 99;
    - one symbol twice then a count ("OO2");
    - an element alone with a count other than 2 / 3 / 4 / 8;
    - an element no puzzle uses (`RARE_ELEMENTS`: "Nd" for Na, "Cd" for Ca).

    The reader also refuses a reading with fewer numbers than the runs of subscripts it saw ("CH₄ +
    O₂" read as "CH4 + O" balances), and `repairEquation` takes that check too.
  - **When nothing is taken:** the balanced reading is still shown, as doubtful. The status asks
    the player to check it against the screenshot, rather than saying it doesn't balance. Typed
    equations are not affected.
- **Not fixed:** synthetic pictures shrunk to about 270 px read much worse. The game's pictures
  come at 440 px or bigger, and the two real 271 / 290 px ones read right.
- `tests/balance.test.js`: 5 new tests (the 8→3 rule, H20 → H2O, the letter fixes, readings refused
  and kept, repair with the caller's check). `npm test`: 284 pass.

## 2026-11-25 — ⚑ reports carry every text paste and the game's data; Cyberpunk's Samurai backdrop

- **Asked:** (1) "In report button if any text was pasted like some textual manual or serial send that
  to me too, like send all data to me in that case". (2) The Cyberpunk theme's default background is
  https://i.imgur.com/Ah1Zs1Z.jpeg.
- **Reports** (`src/core/report.js`, `lib/report.js`, `api/report.js`):
  - `report.js` adds a window capture-phase `paste` listener when it loads. That is before any
    module's "paste anywhere" listener, and those stop the paste for the listeners after them.
    It notes every text paste: the time, the module, where it went (a named box, or "anywhere on the
    page"), and the text. It keeps the last 25, 20 000 characters each. The report's own note box is
    skipped.
  - A report now also sends `pasted` (every text paste this session) and `game` (the data in use
    now). `game` is `GAME_SAVED` + `GAME_MEMORY` from `newGame.js`, read with the new
    `peekSharedState`. It also includes the Password, Who's on First and Word Search lists when they
    differ from the built-in ones.
  - They arrive as `pasted.txt` and `game-data.txt` next to `screen.txt`. Each file is only sent when
    it has something in it. 6 pictures + 3 files stays within Discord's 10 files per message. The
    message lists what each file is.
  - The report box says what it sends, and SENT ✓ counts the pastes too.
  - Checked in headless Chromium on the dev server:
    - A star list pasted with nothing focused was taken by Astrology's own listener, which stops the
      paste, and it was still logged.
    - A paste into the serial box was logged as `box: type once per game`.
    - `game-data.txt` had the serial and the star list.
  - Tests (`tests/auth.test.js`): file names, the empty case, and the webhook getting 9 files.
- **Cyberpunk backdrop:**
  - The picture is bundled as `src/assets/cyberpunk-samurai.jpg` (1280×720, 32 KB) instead of
    loaded from imgur, which blocks some visitors.
  - `cyberpunk.css` and Heist's copy in `heist.css` draw it in `body::before` (cover, centred, under
    the faint scanlines) in place of the skyline SVG. A background picture of your own still hides it.
  - The single-file build inlines it, about 43 KB per copy, so it works offline too.
  - Bomb app: Settings → Dim now dims it as well. ThemeContext sets `--bg-veil`, and the skin's CSS
    lays that over the picture. `SKINS.cyberpunk.picture` enables the slider, and a note says the
    skin shows its own picture.
  - Heist has no Dim slider. Its see-through buttons (COPY ON DECODE, COPY ANSWER, clear, the
    footer's) get the page colour behind them, because the logo's white fangs made their text hard
    to read.
- **Tests:** 279 pass.

## 2026-11-25 — Astrology: "Chameleon" in the star list; faded sky-map borders

- **Asked:** the star list said "not recognised: Chameleon" (game 4's list; game 1's spelled it Chamaeleon).
- **Star list** (`astrologySolver.js` `canonConstellation`):
  - Alias `chameleon` → Chamaeleon.
  - A typo fallback: a name within 1 letter (names under 8 letters) or 2 letters (longer names) of
    exactly one constellation is taken as that one. A tie, like "Ursa Manor" between Minor and
    Major, stays unrecognised; names under 4 letters are never guessed.
- **Sky map** (`astrologyVision.js` `isBrass`): this game's map has its orange frame faded to about
  (244,208,160), not (255,205,135), probably from recompression. `b < 150` rejected it, so the frame
  wasn't found. The frame lines were read as 4 extra glyphs (Cassiopeia, Andromeda, Serpens and
  Corona Australis read twice) and Vela, near the edge, went missing. The blue cap is dropped; ink
  can't match because it needs max − min < 60. The map now reads 88/88.
- **This bomb:** 9 stars → Antlia, Scutum (both BL); buttons Pyxis, Pictor, Vulpecula, Norma → **4**
  (Norma, BL).
- **Tests:** a game 4 test with `astrology_map_game4.png` and `astrology_defuser_9.png` covers the
  list, the 88/88 map, the buttons and the answer, plus alias and typo cases. 278 pass.
- **Conso:** `bomb-logic.js` was rebuilt, so conso's app has both fixes.

## 2026-11-25 — Dixie's theme recoloured, and a little less soft

- **Asked:** keep light blue (Dixie's favourite) as the main colour. The second colours are reddish,
  magenta and pink, with white next to the pink. Purple is still there, but the least of all. The
  first try was "way too soft", so make it a little less soft (only a little), and change the
  background too.
- **Colours** (`skins.js` `DIXIE`, `styles/skins/friends.css`):
  - Light blue `#8EC5FF` stays the accent: answers, links, active buttons.
  - Hot pink `#FF4FA3`: labels, the eyebrow, hover and focus, the drop box's edge, panels' top edge.
  - Magenta `#E0218A`: glows, the scrollbar, the horizon.
  - A reddish `#FF4D6A`: the drop box's icons.
  - White: stars and the drop box's title.
  - Purple: only the far ridge's faint edge.
- **Less soft:**
  - The background is a deep navy `#0A0F1E` (was a periwinkle `#121429`).
  - Angular ridges with a hot-pink rim replace the round clouds; crisp stars replace the sparkles;
    one faint pink light beam.
  - The font is Outfit (was the rounded Quicksand).
  - Active buttons are solid light blue with a hot-pink underline (was a pastel gradient and glow).
  - Panels get a thin pink top edge instead of a soft glow.
  - The title goes light blue → hot pink, with a slanted bar under it (was a ✦).
- **Picked before?** While a skin is on, its colours now come from the skin itself, not from the
  ones saved with it, so anyone who already had Dixie on gets the new look. Done in both apps
  (`ThemeContext`, Heist's start-up).
- Heist's chosen theme button had a yellow ring for every theme. Under Yuza it's now red, under
  Dixie light blue.
- About → Credits: Dixie's name is light blue → hot pink.

## 2026-11-24 — Logic: red false results; compared with conso's Logic

- **Report:** the FALSE word above a false result was confusing. Make the false one's background
  red instead; the colour is enough.
  - `AnswerPanel` takes `tones` (`'bad'` = a red chip) in place of `labels` (only Logic used them).
  - `CopyLines` items take `tone`.
  - Logic marks its false results with both, and the FALSE word is gone.
- **Compared with conso's Logic** (`conso/bomb2.0/logic-module.js`). It already evaluates with this
  app's `evaluateExpression` (ported earlier), so the answers are the same. What it did better,
  now done here too:
  - **The P–T values are saved** (`bombvision_logic_vars`, a shared setting). A reload kept conso's;
    here it silently went back to the built-in values, which gives wrong answers in a game with
    other ones. They're shared by every Logic window, and New game resets them.
  - **A phone's copy from Discord is read.** conso cleans `**P** = **T**`. Here the text box used its
    own regex without `discordPlain`, so the bold marks stopped it. It now uses `parseManualText`.
  - **The formula coloured by value**, under each stage in the workbench (`expressionTokens`):
    letters green / red, α–δ grey until solved, anything not understood underlined.
  - **A stage waiting on an earlier one** shows … and "waits for α: fill in its stage first", not ⚠
    with an error.
  - **More ways to write the operators** (`normalizeExpression`): ⇒ ⟹ ⟶ (conso's own symbol),
    `&&`, `||`, `*`, `+`. `&&` and `||` used to fail.
- **Kept as is:** an unbracketed chain like `a → b → c` groups to the right, `a → (b → c)`. That is
  the usual rule. conso's old evaluator grouped it to the left, but the game brackets every formula
  in the screenshots we have, so it hasn't mattered.
- Not changed in conso: it gets the evaluator part when `bomb-logic.js` is next rebuilt.
- Tests: the operator spellings, right grouping, the coloured tokens and the Discord bold paste.
  Checked in Chromium: the red chip and copy button, no FALSE word, the coloured formulas, and the
  P–T values kept across a reload.

## 2026-11-24 — The OGs: Yuza and Dixie (role, ⚑ reports, their themes, credits)

Yuza and Dixie were the site's first two players (`yuza.html` and `dixie.html` are theirs). They now
have a role of their own; nothing changes for anyone else.

- **Role** (`OG_IDS`, `lib/users.js` `isOg` / `isLockProof`): like the owner they are always let in,
  even while Supabase is down or paused (`accessFor`, `api/auth/callback.js`), and nobody can block
  or time-limit them or the owner. `/admin` refuses it (`err=protected`) and shows "OG: always
  allowed" instead of buttons.
- **`/admin`, view only:** an OG can open it and see everyone, without forms and with a "View only"
  note. A POST from an OG is refused (403).
- **Badge:** OG by their name on the Heist / Bombs page (`GameChooser`), in `/admin`, and in About
  ("That's you"). `/api/unlock` and `/api/auth/me` now return `og`.
- **The owner's badge:** OWNER in Cyberpunk 2077's colours (yellow, red corner, cyan edge) on the
  Heist / Bombs page, the login page and in `/admin`. The login page shows OG for the OGs too.
- **⚑ WRONG ANSWER?** under every answer, for the owner and the OGs (`ReportButton.jsx`, in
  `ModuleLayout`, Wire Sequences and 5-Chess). An optional note, then SEND. `src/core/report.js`
  collects, from the page as it is (no module had to change):
  - the pictures pasted into that module (each `Dropzone` notes them);
  - the pictures and boards it shows;
  - its text on screen (what it read, its working) and the answer;
  - the serial and the device.
  `api/report.js` checks the session (owner or OG, own site, one report every 5 s) and posts it to
  the Discord webhook in `REPORT_WEBHOOK` (`lib/report.js`). The first picture shows in the
  message; the rest come as attachments, plus `screen.txt`. It never pings anyone. Up to 6
  pictures, kept under the site's 4.5 MB request limit. Without the webhook the button says reports
  aren't switched on.
- **Themes** in Settings → THEME & COLORS and in Heist's Theme Colors (`src/core/skins.js`,
  `styles/skins/friends.css`):
  - **Yuza:** mainly black, with blood red and purple, a vampire night. It has Grenze Gotisch
    lettering, a blood drip under the title, and a full moon with bats (dimmed when the page is
    narrow). Along the bottom are a cathedral and tower with red windows, a graveyard, a bare tree
    and roses.
  - **Dixie:** Dixie's favourite light blue and lavender. It has Quicksand lettering and the title
    in a blue-to-lavender gradient (like their Discord name), with sparkles over a bank of clouds.
  - The skin code now takes any number of skins (Cyberpunk 2077 included). A background picture
    replaces the drawings, and changing a colour by hand turns the look off.
- **Credits** in About: Yuza and Dixie, the first two players.
- `check-setup.mjs` notes `OG_IDS` and `REPORT_WEBHOOK` (optional, never stops the build).
- Tests: OGs get in when blocked, expired or with the database down. `/admin` is view-only for
  them, and the owner and OGs are protected. Reports cover the webhook format, the message
  (no pings, Discord's limits, a code block that can't be closed early) and who may send. They also
  check the picture types and limits, the rate limit and a deleted webhook.
- Checked in Chromium (full build): the OG badge, credits and theme list. A Balance report carried
  the picture, the module name, the answer, the note and 800 characters of screen text, and SENT ✓
  showed. Grouped modules get one ⚑ per card. Both themes were checked in the bomb app and Heist,
  and on a 390 px phone with no sideways scroll. There were no console errors.

## 2026-11-24 — Faster sidebar, tab switches and Hangman

- **Report:** basic things like opening the sidebar felt laggy sometimes.
- **Cause:** every module opened in a game stays mounted (hidden), and none of them was memoised.
  So any state change at the top re-rendered all of them. That covered opening or closing the
  sidebar, a tab switch, Settings, a copy (the stamp flash, twice) and a pasted screenshot
  (`setLastImage`). All 30-odd modules also read one big `useAppState()` / `useToast()` context
  whose value changed on each of those.
- **Fix:**
  - `App.jsx`: module windows are `React.memo` components (`ModuleWindow`, `GroupWindow`,
    `Chess63Window`). `renderModule` and `MODULE_META` moved out of `App`. The handlers are stable
    (`useCallback`). `MissionSidebar` and `ModeRouter` are memoised too. The toast is its own
    `ToastBanner`.
  - `AppStateContext.jsx` is split. `useAppState()` now holds the settings and the stable setters.
    `useAppMode()` gives `[appMode, setAppMode]` and `useClip()` the last copy.
    `setLastCopyString` / `setLastImage` write to a ref: nothing read them.
  - `ToastContext.jsx` is split the same way. `useToast()` is `{ showToast }` (stable),
    `useToastState()` the toast and `useToastFlash()` the stamp flash.
  - `sidebar.css`: `will-change: transform` on the sidebar.
  - Hangman (`hangmanSolver.js`): the best-letter search caches each word's letter positions as bit
    masks with a short id for memo keys. Two-word lists are settled directly, and `groups` is
    worked out only when read. That makes it about 3× faster. Results are identical to the old
    search on 122 word lists and 1531 plan nodes, including lists over 40 words, duplicates and
    mixed lengths.
- **Measured** (Chromium with the CPU slowed 4×, every module opened, click → next paint):
  - Sidebar open: 40 → 24 ms (React 21 → 3 ms).
  - Tab switch: 56 → 24 ms (38 → 6 ms).
  - About & Settings: 48 → 24 ms.
  - Hangman first open: 232 → 96 ms.
- **Not changed:** the backdrop's 2px blur. It is the next suspect if Firefox still stutters, but
  removing it would change how the page looks.

## 2026-11-24 — Mines: the 16-mine total settles the last step

- **Report:** a board's last step should have given J5 J8, but the answer was "no new safe
  squares". The user suspected the "This input solves Mines" change; that change only adds a label.
- **Cause:** the solver used only the numbers. There, J6 = 3, I7 = 3 and I8 = 2 allow two layouts:
  J7 a mine (16 mines on the board) or J5 and J8 mines (17). Only the total tells them apart,
  and the game always hides 16 (user, 2026-11-24).
- **Fix** (`src/modules/mines/minesSolver.js`):
  - `solveMinesGrid(grid, { totalMines })`. Without the option it works as before.
  - `MINES_TOTAL = 16`; the module passes it.
  - Each independent group's layouts are now counted by how many mines they hold (`layouts`). A
    layout only counts if the other groups and the squares no number touches can make up the rest
    of the 16. Those untouched squares are all safe when no mines are left for them, and all mines
    when every one is needed.
  - It returns `countOk` (false when the board can't hold 16 mines) and `byCount` (the squares
    only the total decided).
- **Module:** MINES shows "x/16". A 🔢 note names the safe squares only the count decided (and the
  mine it placed). A ⚠ note says when a reading can't hold 16 mines, which means a square is misread.
- **Conso:** `bomb-logic.js` rebuilt (v4). `minesweeper-module.js` passes the total and shows the
  same notes; its MINES stat counts flags too.
- **Tests** (`tests/minesSolver.test.js`):
  - The 24 Nov board: no answer without the total, J5 J8 with 16, nothing extra with 14.
  - 2000 random 16-mine boards: never wrong, and the real total always fits.
  - 300 late-game boards checked against full enumeration with the total; 67 needed the count.
  - No mines left means the untouched squares are safe.

## 2026-11-24 — Manual pictures on phones: a 📖 box for the manual's link

- **Report:** many picture manuals couldn't be pasted on phones. Phone players paste the image's
  Discord link. On a computer a manual is pasted "in air" (Ctrl+V anywhere on the page), and a phone
  has nowhere to do that: long-press only offers Paste inside a box.
- **What was there:** each picture box had a small "Long-press → Paste image / link" box since
  2026-11-18. Tested on an emulated Pixel 7, it did read every manual from a link, a picture or a
  keyboard insert. But nothing tied it to the manual. The boxes that named the manual (Knobs' manual
  table, Laundry's helper manual, the Wire Sequences / Circuit 📖 bar) were text boxes, and a link
  pasted there became manual text.
- **Fix:**
  - `src/core/airPaste.js`: `pasteInAir(src, { card, done })` hands a picture or link to the picture
    box on screen, the same way a Ctrl+V with nothing focused does.
    - `card` = the card it was pasted in; without one it goes to the selected card, as Ctrl+V does.
  - `Dropzone` listens for it (same visibility and group rules as its page-wide paste) and reports
    back when the picture has loaded or failed.
  - `ManualPasteBox` (in `Dropzone.jsx`): "📖 <manual> — picture or link", the existing phone paste
    box with its own label. It is hidden with a mouse, like the phone paste box. Placed where each
    module asks for its manual:
    - Knobs, Simon, Astrology (sky map), Laundry (helper manual), Batteries (table), Wire Placement
      (table), Symbols (helper grid);
    - the Wire Sequences / Circuit 📖 MANUAL bar and the MAZE MANUAL bar. Their phone tips now point
      to the box instead of "a card's picture box".
  - `manualBoxPaste()`: a picture, or a link on its own, pasted into a manual's text box loads as the
    picture instead of being typed in. Normal text pastes are untouched. Used in Knobs, Laundry,
    Circuit, Wire Sequences and the bar's text box, on computers too.
  - Pipes and Blackjack "helper" pictures are per-bomb pictures (like module screenshots), so they
    stay with the picture box.
- **Checked** in Chromium on an emulated Pixel 7, with a link pasted into each new box:
  - Knobs, Simon, Circuit, Maze, Astrology, Laundry, Batteries, Wire Placement and Symbols all read
    their manual. Wire Sequences has no manual picture fixture, so only its box was checked.
  - With 3 cards: a link in card #2's box loads into card #2; the Circuit bar's box loads into the
    selected card (#3).
  - On a computer the boxes are hidden, and a link pasted into the Knobs table box reads the manual.
  - 268 tests pass.
- **Conso:** not ported yet (its UI is separate, `*-module.js`).

## 2026-11-24 — Cyberpunk 2077 theme (bomb app and Heist)

- **Request:** a Cyberpunk 2077 theme in both theme lists, in the game's red, cyan and yellow.
- **Colours** (`src/core/cyberpunk.js`, sources noted there):
  - From cyberpunk.net's own stylesheet and button pictures: yellow `#FCEE0A` (its main colour,
    49 uses), cyan `#00F0FF`, red `#FD0130`. CD Projekt's print yellow, Pantone 3945 C, is the same
    yellow.
  - From the game's menus, as copied by CPStyling.lua (a mod library made to match the in-game UI):
    the red text `#FF6154`, the background `#0F0A0F` and the dark red borders.
- **Bomb app:** a `skin` preset in `THEME_PRESETS` (`themePalette.js`).
  - `ThemeContext` keeps it in `bombvision_skin` and sets `<html data-skin="cyberpunk">`.
  - It also sets the skin's own colour tokens (`CP_VARS`: borders, cyan soft text, drop highlight).
    These go inline, like the palette, because inline tokens beat the stylesheet.
  - Changing the background or accent by hand turns the skin off. A colour box handing back its own
    value on blur counts as no change, so it no longer resets anything.
  - The rest of the look is `src/styles/skins/cyberpunk.css`, added before `touch.css`:
    - Rajdhani, a free stand-in for the game's Blender Pro, loaded only while the skin is on;
    - square panels with a red corner notch, the answer card in yellow with a yellow edge;
    - cut-corner buttons, with the focus ring drawn inside them;
    - a cyan drop box with a solid backing;
    - a fixed backdrop: an original skyline drawing (inline SVG), scanlines and neon haze. A
      background picture (`body.bg-picture`) hides it.
- **Heist:** a Cyberpunk 2077 preset button in Settings → Theme Colors.
  - `applySkin` in `heistCore.js` saves it in `braillevision_skin`, and it comes back on reload.
  - Heist uses `--brass-deep` both as text and as a fill under white text, so there the skin sets
    yellow as `--brass` and the game's red as `--brass-deep`.
  - Any colour picked by hand, Reset all, or an import without it turns it off. Export saves it.
  - Its background picture now sets `body.bg-picture` too, so a picture replaces the backdrop.
  - Leaving Heist clears `data-skin`, the skin's tokens and that class (`HeistApp.jsx`).
- **Background picture:** imgur can't be searched by crawlers. The one imgur link found was a
  desktop screenshot with a GPU-Z window on it, so the theme draws its own backdrop instead. Any
  i.imgur.com link still works in the picture box.
- **Checked** in Chromium, at desktop size and on an emulated Pixel 7, in both apps:
  - the preset turns on, survives a reload, and stays per app;
  - no page errors;
  - every module was opened with the skin on to find boxes that were still rounded.
  - 264 tests pass.

## 2026-11-24 — Button: "serial has at least as many letters as digits"

- **Report:** a round's checklist had the rule "serial has at least as many letters as digits". The
  Button module marked it "⚠ unclear", so every rule after it was blocked.
- **Cause:** `compileClause` only knew a count against a number ("serial has at least 2 vowels").
  It had no wording for comparing one kind of serial character against another.
- **Fix** (`src/modules/button/buttonSolver.js`): a new `serialComparison` clause handles:
  - `(at least | at most | exactly)? as many X as Y`
  - `(no)? more / fewer / less X than Y`
  - `the same / an equal number of X and Y`
  - The forms work after "serial has / contains / includes" or as "there are … in the serial".
  - X and Y can be letters, digits (or numbers), vowels, consonants, odd digits or even digits.
  - The clause shows as e.g. "serial letters ≥ digits".
  - `splitClauses` no longer cuts "the same number of letters and digits" in two at its "and".
- **Conso:** `bomb-logic.js` rebuilt. Conso's Button uses the same parser, so it has the fix too.
- **Tests:** a new test in `tests/button.test.js` covers each wording on real-style serials,
  including a tie (AB12 counts as "at least as many").

## 2026-11-24 — Hangman: a first screenshot after a missed guess records the miss

- **Report:** dropping a screenshot with no box filled should mean the guessed letter isn't in the
  word, but nothing happened, and the miss had to be tapped in.
- **Cause:** `applyShot` only called it a miss when the stick figure grew since the previous
  screenshot. The app suggests the first letter before any picture, since the word list gives the
  length. So the first screenshot usually comes after the first guess. If that guess missed, the
  picture shows just the head and no letter. With no earlier picture to compare against, it was
  only treated as "the figure was already started", and the note asked for the misses by hand.
- **Fix** (`src/modules/hangman/hangmanShot.js`):
  - A bomb's first picture with only the head drawn and no letter showing is that first guess
    missing. It is recorded as "No <letter>" for the letter the app suggested, or the one typed in.
  - With no letter to go on, it asks which letter missed.
  - The "figure already started" note counts a letter still to be named as one of the guesses.
  - The ask box says "A body part was drawn but no letter showed".
  - Unchanged:
    - the start picture (gallows only) is no guess;
    - more than the head with no letters still gets the note, since the app can't name those misses;
    - a miss already tapped in isn't added twice.
- **Tests:** a new test in `tests/hangman.test.js` uses made-up screenshots, like the existing ones,
  plus the real start picture. It fails on the old rule (no miss recorded) and passes now.
  - The reader itself is already proven on real pixels: a lone head (`hangman_t3_9.png`) and empty
    blanks (`hangman_empty_8.png`).
  - There is no real screenshot of exactly this case yet.
  - 263 tests pass, and the build succeeds.
- Conso's `bomb-logic.js` is regenerated (its Hangman uses the same `applyShot`), with the same ask
  wording in `hangman-module.js`. Uncommitted in `conso/bomb2.0`.

## 2026-11-24 — Conso's app: this app's fixes since the last sync (Chess race, Venn, Search, auto-copy)

Every fix made here since conso's 2026-11-23 sync was checked against `conso/bomb2.0`. These were
missing there:

- **Chess: the search race (the c4 bug).** Conso's `chess-module.js` had its own copy of the old
  controller: the next search started on `readyok`, so it could get the previous search's move.
  - Replayed in the browser with this game's pictures (22 / 23) arriving while the last game was
    still being solved. Before: 6 of 8 runs showed White's dxc3 as Black's best move (Qc1# is mate).
    After: 8 of 8 right, from source and from the built `dist/`.
  - The module now uses this app's controller from `bomb-logic.js` (`BombLogic.chess`: `askEngine`,
    `scoreAllMoves`, `cancelSearch`, `legalSan`) instead of its own copy:
    - a search starts only after the previous one's own `bestmove`;
    - a new board or Reset All stops the old search;
    - a stuck engine is replaced;
    - a move that isn't legal on the asked board is never shown ("engine answer … doesn't fit this
      board — press Solve again").
  - A solve now waits for chess.js (up to 5 s) so every move gets that check.
  - `stockfishSource.js` imports `public/stockfish.js` as text, which esbuild can't bundle.
    `build-conso-logic.mjs` therefore swaps it for the same build from jsdelivr, which is where
    conso loaded the engine before.
- **Venn: the serial-vowel rule removed**, as in this app's Diagram.
  - The Shaded / Non-shaded drop-down decides, and it starts on Shaded.
  - Venn's serial field and vowel note are gone, and the serial bar no longer fills a Venn field.
- **Word Search: the 628-word bank is the default** (it was the old 48 words).
  - The bank moved out of `src/modules/search/index.jsx` into `src/modules/search/searchWords.js`,
    so both apps use one list (`BombLogic.search.MASTER_SEARCH_WORDS`). `index.jsx` re-exports it,
    and `tests/searchWords.test.js` imports it.
  - Conso never saved the word list, so there is no old saved list to replace.
- **Auto-copy: no late copy after the player left the page**, the same rule as here.
  - The rule comes from `src/core/leftPage.js`, bundled as `BombLogic.page`.
  - Conso copies by itself in three places: Circuit, Rubik's Cube and Venn. Every other conso
    module copies only on a click, which counts as an action.
  - If the player left first, nothing is written. The answer says "⚠ Not copied (you left the
    page) — click to copy" (Venn: "press Copy"), and a click copies it.
- **Logic: values copied from Discord on a phone** (`**P** = **T**`, `__Q__: F`, `> R = T`).
  - Conso's own value parser only removed asterisks, so `__Q__: F` was lost.
  - It now runs `discordPlain` first, bundled as `BombLogic.text`.
  - The other manual boxes already use this app's readers, which include `discordPlain`.
- Already in conso through `bomb-logic.js`, so nothing to port:
  - the Symbols and Logic reader fixes;
  - Circuit's dark label text;
  - `discordPlain` in the Knobs, Battleship, Astrology, Circuit, Button and Who's on First readers.
- Not a problem in conso: the Logic FALSE label. Conso's stage cards already show TRUE / FALSE in
  green / red.
- Version strings bumped for the changed scripts: `bomb-logic`, `serial-bar`, `chess`, `venn`,
  `search`, `circuit`, `rubiks` and `logic`.
- Checked:
  - from source and from the built `dist/` (signed in, served inside the browser): the chess race,
    Venn, Circuit (stayed / left / click), Search, Logic;
  - all 32 tabs open with no page errors;
  - the five modules ported earlier still pass;
  - 262 tests here pass, and both builds succeed.

## 2026-11-24 — Conso's app: Blackjack, Batteries, Wire Placement, Laundry, Battleship

- Asked for: every module added here, except Balance, in conso's app too. Balance stays out.
  5-Chess isn't a module tab (it's the level 6.4 batch solver), so it isn't ported.
- `scripts/build-conso-logic.mjs`: the five modules added to `MODULES`. Batteries takes
  `core/sectionsData` for the module names in its table.
  - `conso/bomb2.0/bomb-logic.js` was regenerated (623 KB).
  - For the tabs conso already had, the only change is that their text readers strip Discord
    formatting (`discordPlain`). That was checked by rebuilding with the old module list and
    diffing against conso's copy.
- Conso, new files:
  - `module-kit.js`: what the five share (look, picture input, copy button).
  - One script per tab: `blackjack-`, `batteries-`, `wireplace-`, `laundry-`, `battleship-module.js`.
- Conso, edited files:
  - `solver.html`: tabs, sections, init hooks, scripts, help cards (25), and the maze's paste guard.
  - `dragdrop-helper.js`: drop routing.
  - `serial-bar.js`: the Laundry serial joins the shared serial.
  - `scripts/build.js`: the login gate treats `.mk-dropzone` as a solver control.
- Checked in a browser, from source and from the built `dist/` signed in, with this repo's
  fixtures:
  - Blackjack STAND; Wire Placement A1-A2 Yellow; the Batteries order; Laundry's worked example
    (1, 4, 2, 11 presses).
  - Every conso tab opens with no page errors.
  - Nothing is wider than 390 px.
  - Signed out, the new drop areas open the login box.
- Not committed in conso (a commit wasn't asked for this time).

## 2026-11-24 — Auto-copy: no late copy over what the player copied in Discord

- Report: pasting a manual sometimes pasted the previous stage's answer instead. Copying the
  manual again in Discord and pasting again did the same.
- Cause: an answer can arrive seconds after the paste that started it (OCR of a manual page, the
  chess engine, OCR of a table). Every module auto-copies when its answer changes, whatever the
  player is doing by then.
  - Laundry with the last load's message, then the manual pictures pasted: the answer (last
    load's counts with the new manual) was written to the clipboard 9.5 s later in the test.
  - By then the player is in Discord copying the next picture. Firefox allows the write for about
    5 s after the last key press on the page, even unfocused, so the clipboard got the stale answer.
- Fix: `src/core/leftPage.js` notes the player's last action on the page and when the page lost
  focus or was hidden.
  - Actions are click / touch / key / paste / drop. A file arriving from the upload dialog counts
    too, since the dialog also takes the focus.
  - `useClipboard` `copy()` writes nothing if the page lost focus after the last action. The answer
    shows "⚠ NOT COPIED — CLICK HERE", and clicking it copies (a click is an action).
  - Coming back without doing anything doesn't re-enable it, so a late answer can't land on top of
    the picture just copied in Discord.
- Checked in the built app with the clipboard logged:
  - left right after the paste: nothing written, NOT COPIED, one click copies;
  - stayed: copied as before;
  - left and came back: not copied, one click copies.
- The earlier settings, phone, Laundry and theme checks still pass. `tests/clipboardGuard.test.js`
  covers the rule.

## 2026-11-24 — Balance: equation reader at other picture sizes

Three game pictures misread (now `tests/fixtures/balance_propane_small.png` 271 px,
`balance_alcl3_big.png` 747 px, `balance_al_ni_small.png` 290 px):
C3H8 + O2 → CO2 + H2O was read as C3H6 + O2 → CO + H2O (which balances, so it was shown as right);
AlCl3 + Na3PO4 as "NapO4"; Al + Ni(NO3)2 → Al(NO3)3 + Ni as "A + NHNO3)2 → AUNO3)3".

`balanceVision.js`:
- `fixDigitByLoops`: two loops of solid ink are an 8. In a small "₈" the soft edge pixels fill
  the top loop, and the solid count was only used to rule an 8 out.
- Both sides of the arrow line share one letter height (the smaller one). "CO₂ +" before a wrap
  had the glued "CO₂" as its only tall glyph, so the subscript's bottom became the baseline and
  the ₂ was never cut off.
- `splitTouching`: bold letters touch in small or blurred pictures ("Al", "i(N", "l(N", "CO" were
  each one blob, read as one letter). Measured on all six pictures, a column inside a blob with
  no solid ink (> 170) only happens between two letters. Real letters' thinnest columns (H's
  crossbar) still have 2+ solid pixels. It runs in two passes:
  - before the subscript cut: columns with no solid ink at all;
  - after it: also columns whose little solid ink is all along the top or bottom edge (two serifs
    touching, "(N"). Mid-height ink (a crossbar) or ink at both edges (the middle of O / C) never
    counts.
- One-pixel-wide pieces next to a neighbour are dropped. A cut left one, which read as "1":
  "O12".
- A narrow upright glyph read as "[" / "(" / "|" (not bracket-tall) is "l". A full-height
  p / q / y / g that doesn't hang below the line is the capital.
- An unread subscript is now "?" instead of being dropped, for the repair below.

`balanceSolver.js` `repairEquation(lefts, rights)`, used only when no reading balances:
- Tries each side of every reading (sides from different readings can pair up) with up to 2
  changes over both sides:
  - characters OCR confuses: S / s / g → 3, D → O, t → l, digit look-alikes;
  - a "?" filled with a digit;
  - a lost bracket. One at the start of a formula costs 2 changes, so "Al(NO3)3" beats
    "(AlNO3)3", which balances too; "(NH4)2SO4" still works.
- Keeps the version that balances with the fewest changes from the most trusted readings. Both
  sides must hold the same elements, and only one clear balance counts.
- If two different answers tie, it returns nothing: C?H? + O2 balances for any digits, so a fill
  there would be a guess. The status line says when characters were filled in.

Checked in the browser on the six pictures, each at 0.8×, 1×, 1.25× and resized to 440 px (24 reads):
- Old: 14 right, 4 wrong but balanced, 6 not balanced.
- New: 22 right, 0 wrong, 2 not balanced (the 0.8× shrinks of the two small pictures, letters
  about 11 px tall). Those show the "doesn't balance — fix the text" warning.
- Every picture the old reader got right still reads the same.

## 2026-11-24 — Batteries: "Under 3V" read as "Under 8V"

- Cause: the condition words were turned black-and-white at one fixed brightness (92), low enough
  for the grey "total". That also blackened the soft edges of the bold white text, so the 3's
  openings closed and Tesseract read 8. Whether it happened depended on the picture's size: the
  24 Nov 880-px table failed, the 2000-px one didn't.
- `batteriesOCR.js` `inkMask(…, { local: true })` for the condition column: a pixel is ink only
  when it is at least halfway from the background to the brightest text within about a stroke
  (`squareFilter` max / min). Bold white text keeps its shape, and grey text is still all there.
  Headers and badge digits are unchanged.
- Checked through the app's real OCR on the three tables, each at 0.8×, 1×, 1.25×, 1.5× and 2×.
  - Before: 6 wrong numbers ("Under 8V" ×3, "4.6V" ×3) and 2 rows not understood.
  - After: no wrong numbers, every row understood.
  - Still open: the 20-module table loses one row at 0.8× and 2× in the layout reader. That is
    not OCR, and Discord pictures arrive at their own size.
- `parseCondition`: a short icon row one letter from "Has" / "No" with the same first letter
  ("Hag", "N0") is read as that, since the icon gives the battery.
- `oddVolts`: totals are made of 1.5V and 9V batteries, so a row voltage that isn't a multiple of
  1.5 shows "⚠ check the number" under the row.
- Tests: the 24 Nov table as `tests/fixtures/batteries_table3.png` (every badge and icon); the
  local ink rule on a row of pixels; the slips and the voltage check.

## 2026-11-24 — Laundry: press counts confirmed; Load 1 counts without a picture

- Players' worked example (Discord, 17 Sep) matches the solver exactly, and is now a test:
  - Manual: remaining + 1, solved + needy + 2, last serial digit + total + 4.
  - Counts 7 / 1 / 1 / 9, serial ending in 9 → Skirt / Corduroy / Clouded Pearl.
  - Answer: 40°C, Low heat, Iron, Non-chlorine bleach (Clouded Pearl, the first care rule, wins).
  - Their click counts were 1, 4, 2 and 11. That confirms two things that were only assumed:
    - Load 1 always starts on 30°C, High heat, 150°C, Bleach.
    - A press steps to the next symbol in the symbol sheet's order.
- The module now uses that start for a Load 1 message without the module picture:
  - The copied answer includes the ↻ press counts.
  - The "*" ("presses assume …") is gone for Load 1.
  - Later loads without a picture keep the "*", since their start isn't known.
- Not changed: a 24 Nov load (serial 2MD899L0, total 9, colour = last digit + total + 2) gives
  Malinite by this method. The answer reported for it needs Jade Cluster, which fits only a serial
  ending in 4. Waiting on where that answer came from.

## 2026-11-24 — Settings: THEME & COLORS (whole palette from one colour, accent, themes, picture dim)

The old CUSTOMIZE BACKGROUND only set `--paper`. Panels, borders and text kept the dark theme's colours,
so a light colour gave light text on a light page. It's rebuilt after Heist's Settings → Theme & Colors
(`heistCore.js` `applyBgColor`, which derives the palette from one colour).

- `src/core/themePalette.js`, `paletteFor(bg, accent)`, builds every colour token from one background:
  - Panels, borders, both text colours, dots, cells and the drop area's active colour.
  - Light or dark comes from whichever text colour reads better. On a mid-tone where neither usual
    text colour reaches 4.5:1, it uses pure white or black.
  - Panels and secondary text move until they read (≥ 7:1 and ≥ 4.5:1). The accent moves lighter or
    darker if it would vanish into the panels (≥ 3:1).
  - `tests/themePalette.test.js` sweeps 216 backgrounds × 4 accents.
- `ThemeContext.jsx`:
  - Theme state: built-in theme, custom background ('' = built-in), accent, picture, and a 0–80 % dim
    (a see-through layer of the background colour over the picture).
  - With a custom background it sets every token and `data-theme`, so the light / dark rules follow.
    The built-in colours count as no custom colour.
  - The modules' 📜 / 🌙 button goes to the other built-in theme and drops a custom background.
  - Leaving for Heist clears every token.
- `components/ThemeSettings.jsx`:
  - 10 themes: Midnight and Parchment (the built-in ones), Slate, Forest, Wine, Ocean, Violet, Paper,
    Sand, Mint.
  - Background and accent, each with a colour picker, a hex box (applies only complete colours,
    `#abc` works) and Reset.
  - The picture link is checked before it's used, like Heist: http(s) only, imgur page links turned
    into direct ones, a 15 s load test and a status line. Then a Dim slider and Reset all colors.
- Hard-coded gold replaced by tokens:
  - 97 `rgba(229,184,75,…)` / `rgba(173,122,46,…)` / `#F3CA65` values in 20 stylesheets are now
    `rgba(var(--brass-rgb),…)` and `var(--brass-hi)` (new tokens). The accent reaches every glow,
    tint, focus border and hover.
  - Left gold on purpose: the knob drawing, the Astrology star marks on the sky map, and the
    Morse / Symbols data colours.
- 5-Chess (`chess63.css`) had its own fixed dark palette. It now uses the app's colours, so it
  follows Parchment and custom themes.
- Over a background picture the drop areas get a backing of the page colour (`body.bg-picture`).
- Checked in the built app:
  - presets, a typed `#fff` (light theme, dark text), a typed accent, kept after a reload;
  - the 🌙 button, refused links, Reset all colors;
  - Heist and back (tokens cleared, then put back);
  - phone width (no sideways scroll); screenshots of six setups and 5-Chess.

## 2026-11-24 — Chess: a search could take another search's answer; 5-Chess on Stockfish only; Diagram switch

- **The bug.** A user got **c4** as Black's move on a board that was read correctly, where Qc1# is
  mate in one; a retry was right. The bundled engine (`public/stockfish.js`, which reports itself as
  "Stockfish 2019-08-15 Multi-Variant", the stockfish.js 10.0.2 build) behaves like this, measured in
  the browser:
  - it answers `isready` at once, even mid-search, so `readyok` comes **before** a stopped search's
    `bestmove`;
  - a new `position` / `go` sent before that `bestmove` gets mixed into the old search's reply;
  - a search stopped before depth 1 finishes reports the first move in move-generation order.
    Pawn moves come first, and c5-c4 is Black's only pawn move here: that is the c4.

  Both controllers (Chess's `search()` and 5-Chess's own `askEngine`) took `readyok` to mean "the old
  search is over". So when a solve was replaced (the second picture arriving mid-solve, SOLVE pressed
  again, or a second ANALYZE ALL run), the next search could get the previous search's move.
  Replayed with the module's own flow on the real engine: Black's answer was White's d2c3 in 4 of 12 runs.
- **The fix** (`chess/chessEngine.js`, one controller for both solvers):
  - one message handler; a `go` is sent only after the previous search's own `bestmove` is back;
  - a `bestmove` only answers the search whose `go` is out;
  - a dropped search (replaced, timed out, window closed via `cancelSearch`) is stopped, and its late
    `bestmove` answers nobody;
  - an engine that never answers is replaced by a fresh one.
  Same replay: 12 of 12 right. `legalSan()` checks every move with chess.js against the board it was
  asked about; a move that doesn't fit is never shown (the panel asks to solve again).
- **5-Chess (level 6.4)** uses the shared engine, owner `chess63`; a newer ANALYZE ALL run stops the
  older one (`runId`). The CSV answer book (`CHESS_SOL_CSV`, 48 White positions, answer shown before
  Stockfish's) and its "CSV · engine agrees" note are removed: every answer is Stockfish's. It keeps
  its early stop once the best move has settled (depth ≥ 14). The worker is shared now, so `destroy()`
  cancels its search instead of terminating the worker.
- **Diagram:** the serial-vowel rule (vowel → SHADED, none → UNSHADED, no serial → SHADED) is
  removed. The SHADED / UNSHADED switch decides, starting on SHADED, and the serial doesn't change it.
- Tests:
  - `tests/chessEngine.test.js` (5): a fake engine with the measured reply order covers a replaced
    search, three windows, a closed window, a blunder scan replaced, and the early stop on a mate.
  - In the built app, Chess with an old game loaded and this game's two pictures 0.3–6.5 s apart:
    dxc3 / Qc1# every time.
  - 5-Chess with ANALYZE ALL pressed twice in a row: Stockfish answers only, no CSV text.
  - Diagram: the switch stays put through serial changes.

## 2026-11-24 — Word Search: the 628-word bank is the default

- `MASTER_SEARCH_WORDS` is now the game's word bank from the owner: 628 words, alphabetical, all
  4 letters except MAPLE. It includes the old 48-word default, and both sample grids find the same
  words with it.
- The saved list moved to a new key, `bombvision_search_words_v2`, and the old key is deleted on
  load. Every device gets the new list, even one that had saved the old default or an edit of it.
  Edits in the box are saved as before.
- `tests/searchWords.test.js`; checked in the built app: a device with an old saved list shows the
  628 words, and an edit survives a reload.

## 2026-11-24 — Settings: New game, needy reminder, module picker, last module, working panels

The five settings suggested after the phone pass. All are remembered on this device; the new ones
live in `src/core/settings.js` (localStorage keys `bb_*`, read live through `useSharedSetting`).

- **New game** (`src/core/newGame.js`, `NewGameButton`). The button is in the top bar next to the
  serial, and in Settings. It takes two presses, the second within 4 s; the button says
  "TAP / CLICK AGAIN TO CLEAR" and then "✓ NEW GAME STARTED" (there are no toasts).
  - It clears the saved per-game data: the serial, the Astrology map / list, and the Circuit legend.
    It also clears the Knobs, Wire Sequence and Piano tables, the Button checklist and the Hangman
    list; the last four go back to the built-in default where there is one.
  - It clears the in-memory tables (Simon, Batteries, Wire Placement, Laundry, Button counts) plus
    the maze manual strip and the Symbols grids.
  - Every module window is remounted (its React key holds the game number), which drops the
    screenshots, answers and hand edits each module keeps. The "modules to solve" counts start over.
  - Kept: settings, learned letter / digit shapes, and the Password / Who's on First / Word Search lists.
  - `resetSharedSetting` / `resetSharedState` are new in `sharedSetting.js`. `tests/settings.test.js`
    checks that each listed key is still used by its module.
- **Needy reminder:** it fires 3, 5 (default), 8 or 10 s before each 30-second mark. An optional
  **beep** plays two short tones from the page (Web Audio, started from the ▶ press because browsers
  only allow sound after a tap); Settings has ▶ Test beep. Changing either while the timer runs
  doesn't restart the countdown.
- **Modules in the picker:** tap a module's chip in Settings to hide or show it in the tabs and the
  phone dropdown. Levels still show all of theirs, at least one module always stays, and hiding the
  module on screen moves to the first one shown. `MODULE_REGISTRY` moved to `core/moduleRegistry.js`
  and is re-exported from ModeRouter.
- **Open on the module used last:** on by default. Off, the page opens on the first module shown.
- **Working panels:** "as each module sets them" (the default, as before), "always open" or
  "always closed". A change applies to panels already on screen too.
- Tests: `tests/settings.test.js` (5). In the built app:
  - New game on a phone: one tap and a wait does nothing; two taps clear the serial, the star list
    (the manual bar says NOT LOADED) and the maze answer, and the Password list is kept.
  - New game also clears the Batteries sample table (in memory).
  - Hiding Mines + Astrology leaves 28 tabs and moves to Queens.
  - The page reopens on Astrology after a reload, and on Queens with that setting off.
  - Always closed / always open apply to every panel.
  - With the reminder at 8 s, it comes at 22 s with the beep, then again 30 s later (checked on a fake clock).

## 2026-11-24 — Phones: every module checked; auto-copy setting

Many players use the site on a phone, so every bomb module was opened on an emulated phone (412 px
and 360 px wide). For each one I checked sideways scrolling, controls past the screen edge, small
tap targets, mouse-only actions and desktop-only wording (the audit script measures them; 196 small
controls before, 28 after, and those are text-box headings).

- **Copy status on the answer.** Phones, iPhones above all, refuse a copy that doesn't come straight
  from a tap. An auto-copy after a picture loads could fail silently there, since toasts are off in
  the bomb app, and the player would paste the old clipboard. The answer's hint now says
  `TAP TO COPY`, `COPIED ✓` (this answer is what the page last copied), or `⚠ NOT COPIED — TAP HERE`
  (shown in red). It's kept in app state as `clip` and set by `useClipboard`. The fallback copy now
  also works on iPhones: a read-only box and an explicit selection range.
- **Maze:** the goal was set by right-click, which iPhones never send. A `TAP A SQUARE TO SET:
  🔴 START / 🟡 GOAL` switch sits above the board; right-click still sets the goal with a mouse.
- **Boards that didn't fit a phone:** maze and chess had fixed 44 px squares, and Who's on First's
  two columns couldn't shrink below their menus. The squares now shrink to fit
  (`minmax(0, 44px)` plus `aspect-ratio`). Nothing scrolls sideways at 360 px any more.
- **Bigger controls and no iPhone zoom** (`src/styles/components/touch.css`, phones only, loaded
  last): buttons are at least 36 px tall, Symbols' ± buttons 32 px, and Complex Wires' colour
  swatches and checkboxes are bigger. Text boxes and menus use 16 px text, because an iPhone zooms
  the whole page into any box under 16 px. Fold-out headings are taller, and the smallest labels
  are 11 px.
- **Phone wording** (`src/utils/touch.js`: `useTouchScreen`, `phoneTitle`, `tapWord`, using the
  same test as the CSS that shows the phone paste box):
  - Dropzones say "Paste the X" instead of "Click here, then paste the X" / "Drop / paste the X", with
    "long-press the box → Paste · or tap here to pick a saved picture" under the title.
  - The picture-manual bars (Wire Sequence, Circuit, Maze strip) say to long-press a card's picture box.
  - The group hints say to long-press each card's box.
  - Hangman says "paste" instead of "drop", and Hangman / Astrology point to the 📖 manual box.
  - Chess says "NEXT PICTURE GOES TO" instead of "NEXT DROP TARGET", and "Tap"/"Click" follows the device.
- **Knobs and Battleship** manuals copied from Discord on a phone are now read too (`discordPlain`),
  like the other manuals.
- **Settings → Auto-copy answers (COPY ON DECODE).** One switch for every module and for Heist
  (`src/core/autocopy.js`, key `bb_autocopy`), remembered on this device. The Settings checkbox, any
  module's COPY ON DECODE button and Heist's own toggle / settings checkbox all change it. Until
  someone changes it, the build's default applies: yuza.html off, dixie.html and bomb.html on. Heist
  now follows that default too; it used to start on in yuza.html.
- Tests: `tests/phone.test.js` (titles, the remembered switch, blocked storage), and Knobs and
  Battleship added to `tests/discordText.test.js`. In the built app on an emulated Pixel 7:
  - a refused auto-copy shows ⚠, and a tap copies;
  - the maze START / GOAL taps work;
  - the boards fit;
  - Settings off → every module and Heist start off after a reload;
  - Heist back on → the bomb app is on;
  - yuza still starts off.

## 2026-11-24 — Manuals copied on a phone (Astrology star list and others)

Players on phones couldn't load the Astrology star list: the box held it, but step 2 stayed red.

- **Cause: a phone copies a Discord message with its markdown.** On a computer, copying gives the
  text you see (`20: Hydra, Piscis Austrinus`); on a phone it gives the source (`**20**: Hydra, …`).
  Every line of the list started with `**`, so none was read as "N: names". The same happened to other
  pasted manuals: the Circuit colours, Wire Sequence, Logic values, Piano codes, Who's on First and the
  Button checklist broke on bold labels or numbers, `> ` quotes or `- ` bullets.
- **Fix:** `src/utils/discordText.js` (`discordPlain`) turns Discord markdown back into the text Discord
  shows: bold, underline, italics, strikethrough, spoilers, code, quotes, headings, list bullets and links.
  `\*` escapes stay literal; plain text (formulas like `2*x*3`, `snake_case`) comes back unchanged. Each
  of those manual readers runs it first, and so does the "paste anywhere" check, so a phone copy loads
  however it's pasted: into the 📖 box, into the "Paste image / link" box (the manual is recognised and
  taken from there), or Ctrl+V on a computer.
- **Phones open the 📖 MANUAL box by themselves** while no manual is loaded: a phone has no Ctrl+V, and
  long-press only offers Paste inside a text box. Its button says "✏️ paste" there ("edit" on a
  computer, was "debug"). Astrology's step 2 says to paste into the 📖 box on a phone, and no longer ends
  in a stray "·" when the list came from that box.
- Tests: `tests/discordText.test.js` (12 new) feeds every manual reader its sample in seven phone forms.
  Checked in the app on an emulated Pixel 7 (both paste boxes) and on a desktop (Ctrl+V anywhere).

## 2026-11-24 — Website audit: two fixes

Checked the live site as a stranger and read the login code again before sharing the link.

- **Fixed: the page to return to after logging in could be another site.** `safeNext` refused
  `//evil` and `/\evil` but let `/<tab>/evil.example` through; a browser drops the tab and goes to
  `//evil.example`, so a link like `/login?next=%2F%09%2Fevil.example` sent someone to a look-alike
  page right after a real Discord login (and "Open the solver" on /login did the same). Now the path is
  read with `new URL()`, the way the browser reads it, and anything that isn't this site becomes `/`
  (server and /login). Tests for tab, newline, CR LF, backslash variants.
- **Hardened: the two CDN scripts are pinned** (`integrity` sha384 + `crossorigin` on chess.js 0.10.3
  and tesseract.js 5.1.1 in `index.html`): a changed file on the CDN is refused instead of running in
  a logged-in page. Checked in the browser: both still load.
- Checked and fine: every page, file, old page and source path sends a guest to `/login` (pages) or
  401; path tricks (`/login/../dixie`, `%2F..%2F`, `%64ixie`, case, trailing `/`, `;`) don't get past
  the gate (and the page would still be locked); headers (HSTS, `X-Frame-Options: DENY`, `nosniff`,
  `noindex`); cookies (`__Host-`, HttpOnly, Secure, SameSite=Lax); `/api/unlock` refuses guests (401)
  and other sites (403); `/admin` POST refuses guests; the 14 older deployments all need a Vercel login;
  session and unlock signatures can't be swapped (a session payload is base64url, which has no `:`).
- Known and left as is: GitHub repo is public (owner's call); `npm audit` warnings are in Vite /
  esbuild's dev server only (`npm run dev`), not in the site; logging out is a plain link (another site
  could log someone out, nothing more); with `NEW_USERS=allow` anyone with a Discord account who gets the
  link can log in (`NEW_USERS=wait` to approve each); someone logged in can still pull the running code
  out with developer tools.
- Browser test (Pixel 7) rerun against the locked build: 25 / 25.

## 2026-11-24 — Website: Discord login, /admin permissions, locked code

- **Login**: `api/auth/login` → Discord (scope `identify`, a signed state cookie against forged
  logins) → `api/auth/callback` adds or updates the user in Supabase (`bomb_users`, made by
  `supabase/bomb_users.sql`; RLS on, the server uses the secret key) and sets a 30-day session
  cookie (`__Host-`, HttpOnly, Secure, SameSite=Lax, HMAC-signed with `SESSION_SECRET`).
- **Who gets in** (`lib/users.js`): `allowed` (optionally until a date), `waiting`, `blocked`. A first
  login is allowed (`NEW_USERS=wait` makes it wait). `ADMIN_IDS` are always allowed, even with the
  database down. Answers are kept 20 s per server, so a block reaches the next page load within 20 s.
- **`middleware.js`** runs before every page and file except `/api`, `/login`, `/admin`: guests and
  blocked / waiting / expired users get `/login` (pages) or 401 (files).
- **`/admin`** (`api/admin.js`): everyone who logged in, with Allow / Allow 1, 7, 30 days / Block, time
  left, joined, last seen. Names are escaped; the form only works from the page itself (Origin check
  and SameSite cookies). Someone not in `ADMIN_IDS` is shown their Discord ID to add.
- **`/login`** (`public/login.html`): log in, or the reason you can't get in (waiting, blocked, time
  ran out, not set up, database down), log out, Admin link. The game chooser shows "Logged in as … ·
  Admin · Log out".
- **Locked code** (`scripts/lock-site.mjs`, run by the Vercel build): each app page's inline module
  is gzipped and AES-256-GCM-encrypted with HMAC(`SESSION_SECRET`, a salt new every build). The loader
  posts the salt to `/api/unlock`, which answers allowed users on this site only (Origin check), and
  imports the code from a blob URL, so it never appears in the page's HTML. Saved copies, file copies
  and copies on another site show "THIS COPY DOESN'T RUN HERE". The build fails without
  `SESSION_SECRET`. Pages download about 5% more (dixie 3.73 MB brotli, was 3.55).
- Only the app pages, `login.html` and `stockfish.js` are published; the old `public/` pages (bombs,
  maze, manual_piano_solver, HeistMannHiHiHellowHi, dnd-debug) were reachable on the site before and
  are not now.
- `scripts/check-setup.mjs`, first in the Vercel build: the settings are Sensitive (unreadable from the
  CLI), so the build checks them: `SESSION_SECRET` length, Supabase URL / secret key (not the
  publishable one) / `bomb_users` table, Discord client ID + secret (a client-credentials request),
  `ADMIN_IDS`. ✓ / ✗ in the build log, never a value; any ✗ stops the build, so the live site stays.
  A Preview build without the settings says to use `vercel --prod`. Its first run caught the
  publishable key in `SUPABASE_SERVICE_KEY`.
- `vercel.json`: the setup check and lock step, `/admin` rewrite, `X-Frame-Options: DENY`, `nosniff`, `noindex`.
- Tests: `tests/auth.test.js` (15, fake Discord and Supabase: sessions, forged cookies, state check,
  first login, `NEW_USERS=wait`, unlock refusals, admin block / 1-day / expiry, escaping, database
  down, lock round trip, published files). In a browser (Pixel 7 emulation) against the locked build
  behind a local stand-in for Vercel's routing: login lands back on `/`, all three pages unlock and
  run, Bombs / Heist switch, the running page's HTML has no code, Ctrl+S copies ("complete" and "HTML
  only") opened from a file and a copy on another site show the lock screen, a block from /admin sends
  the user to "No access" on reload and refuses files, "allow 7 days" lets them back in, logout works,
  no page errors.

## 2026-11-24 — Vercel deployment files

- `vercel.json`: `npm ci`, `npm run build`, serves `dist/`; `/` → `dixie.html` (autocopy on, both
  games); clean URLs, so `/yuza`, `/dixie`, `/bomb` and the `public/` pages without `.html`. No CSP
  (the app loads Google Fonts, jsDelivr / cdnjs scripts, Tesseract data and Discord images).
- `.vercelignore`: uploads only `package*.json`, `index.html`, `vite.config.js`, `scripts/`, `src/`,
  `public/` (no `.bak_*`, nor the git-ignored reference copies in `public/`): about 13 MB, 225 files.
- Checked by building in an empty folder from exactly those files: `npm ci` + `npm run build` work,
  and `dixie.html`, `yuza.html`, `bomb.html` and `stockfish.js` are byte-identical to the local build.
- README: a Deploy section.
- **Deployed** with `vercel --prod` from this folder: https://bomb-tan-one.vercel.app (also
  bomb-zuraa2.vercel.app). The first live build was the GitHub one: pushed `main` (8306d77) had no
  `vercel.json`, so `/` was 404. The rewrite first pointed at `/dixie.html`, which clean URLs leave
  unrouted (404 too); it now points at `/dixie`. Checked live: `/`, `/dixie`, `/yuza`, `/bomb`,
  `/stockfish.js` and the `public/` pages answer 200, sources 404; on an emulated phone the chooser
  switches games with one page load, back / forward work, no page errors.
- The Vercel project is connected to the GitHub repo: a push to `main` deploys that commit to
  production, so `vercel.json` and `.vercelignore` have to be in it.

## 2026-11-24 — Phones: picking a game no longer reloads the page

- Choosing HEIST / BOMBS (and the ⇄ link) set the hash and called `location.reload()`. On Android a
  downloaded .html opens as a `content://` address, and a reload has to read that file again, which
  the phone may refuse (the 19 Nov fix only kept the address the same). Now nothing reloads:
  `main.jsx` swaps the game in place on `hashchange` (`show()`), so the back button works too.
  Old `?play=` links still need one load to drop the query.
- Only one game is live, as the reload ensured before: the game being left is unmounted and its CSS
  removed. `HeistApp` records the window / document listeners `mountHeist()` adds (paste, drop, keys,
  focus…) and removes them on unmount, and clears its theme colours; the bomb app's listeners were
  already cleaned up by its effects. `ThemeContext` and the chooser now undo what they set on
  `<html>` / `<body>` (`data-theme`, `--paper`, which the heist also reads, and backgrounds).
- Checked on the built `dist/dixie.html` in an emulated Android phone: chooser → bombs → chooser →
  heist → chooser → bombs, back and forward: one page load in all; page-wide listeners back to the
  chooser's 3 after the heist; each game's page styling identical to opening it directly (also with a
  custom bomb background colour). `dist/bomb.html` has no chooser and never reloaded.
- Not reproducible here: a real `content://` file. The Heist page's own changelog
  (`src/heist/heistMarkup.html`) has no line for this yet.

## 2026-11-23 — Symbols: keypad read with patterns from real screenshots

- Checked on 46 real defuser keypad screenshots (38 different keypads, every symbol 8–18 times),
  found in ~/Pictures/Screenshots. Before: 175/184 buttons. The misreads were a mouse cursor
  on a tile (Ω → ¿, ¿ → Ж), and small or blurry pictures (☆ → Ω / ©, © → Ѿ / Ϙ), where thin lines
  come out grey and a fixed ink cut-off (120) lost them. After: 184/184, also at 0.7×–1.6× size.
- `syReadKeypadTile` (the keypad only; the helpers' grids keep `syReadBox`): the cut-off is halfway
  between the tile's paper and its darkest ink; only ink pieces that reach the middle 40% of the
  tile count (drops the press-order number and a cursor); each 16×16 cell is area-averaged ink,
  compared with `SY_KEYPAD`, patterns averaged from those 184 tiles. Judged with patterns made
  without the keypad being read, they also scored 184/184 at every size. ★ vs ☆ is whether the
  star's middle is ink. Rows are split at the tiles' own middle, not the picture's.
- The helper-grid reader was checked too: all 150 cells of six real helper grids are right.
- Tests: six of those keypads (`tests/fixtures/symbols_keypad_*.png`). Conso's `bomb-logic.js`
  regenerated; committed in `conso/bomb2.0` on `Mann's-branch-3`.

## 2026-11-23 — Symbols: the white inside © is not a keypad tile

- `syReadModule` finds the 4 keypad tiles as white areas. The white inside a symbol is one too
  (©'s ring, ☆'s outline, Ϙ's loop), and in a picture bigger than the game's 440 px (a 584×607
  screenshot) ©'s passed the size check: 5 tiles, the © inside took third place, and ☆ dropped
  out ("Ж © Ϙ ƛ" for Ж © ƛ ☆). Tiles inside another tile are dropped, and only the 4 biggest are
  kept. Reads right from 350 px to 1168 px. Test: `tests/fixtures/symbols_module_copyright.png`.
- Conso's `bomb-logic.js` regenerated; committed in `conso/bomb2.0` on `Mann's-branch-3`.

## 2026-11-23 — Logic: a stage that is only β no longer reads as Q

- The reader tells grey α β γ δ from bold white P Q R S T by brightness, measured against the
  grid's brightest ink. A grid with no white letter or bracket ("β" alone) had grey as its brightest,
  so β counted as white and its one loop made it Q. When every letter-sized symbol is thin and the
  brightest ink is dim (< 215; grey ≈ 190, white ≈ 235), brightness is now scaled to grey (0.79)
  (`readLogicGrid`, `GREY_INK`). Test: `tests/fixtures/logic_beta_alone.png`, at 0.45×–1.6×.
- Tilt is now the first check: the game draws α β γ δ in italics and P Q R S T upright. `measure`
  gives `lean` (the left edge's slope going up, over the middle 80% of rows): α ≈ 0.16–0.21,
  β ≈ 0.20–0.25, P R S T and brackets ≤ 0. `isGreekGlyph` says Greek at `lean ≥ 0.1` whatever the
  brightness; upright glyphs still go by brightness and stroke (γ's arms can hide its tilt; α
  shrunk to 0.45× leans only 0.08). Tested on all three fixtures at 0.8×–1.6×.
- Conso's `bomb-logic.js` regenerated (Logic uses the same reader there); committed in
  `conso/bomb2.0` on `Mann's-branch-3`.

## 2026-11-23 — Logic: FALSE in red above a false result

- Every answer chip is green, so α=F looked like a pass. A false result now has **FALSE** in red
  above its chip (true ones have nothing; the chips stay level). The copied text is unchanged.
  `AnswerPanel` takes an optional `labels` list (one per answer) for this; only Logic uses it.

## 2026-11-23 — Bomb app: a changelog under About, like Heist's

- About & Settings now has a **CHANGELOG ▾** button, as on the Heist page. The list is written for
  players (newest first, by date, back to 10 Nov) and lives in `src/core/bombChangelog.js`.

## 2026-11-23 — Needy reminder: a notification, 5 s before each 30 s mark

- The needy countdown still restarts every 30 s, but the "check the needy" reminder now comes at
  0:05 left (25 s, 55 s, 85 s, …) instead of at the restart (`NeedyTimer.jsx`, `REMIND_BEFORE_MS`).
- It's a **system notification** now, not a toast in the page, so it shows over Discord or any
  other window. The first press of ▶ asks the browser for permission; each notification closes
  itself when the cycle restarts, and clicking it brings the app forward. If notifications are
  blocked or unsupported, the toast is used instead and the button shows 🔕.

## 2026-11-23 — Conso's app: every shared module on bomb-logic.js, serial bar, phones

Committed in `conso/bomb2.0` (branch `Mann's-branch-2`); no new modules there.

- **`scripts/build-conso-logic.mjs`** now also bundles Limbo, Pipes, Hangman, Astrology, Cube and
  Circuit (they had pasted copies, which matched this app's code). Target ES2020 for Circuit's BigInt.
- **Chess** reads boards with this app's `chessVision.js` (also bundled now) instead of conso's
  TensorFlow nets. On 10 real boards (5 white, 5 black) both readers were 10/10. The nets took
  7–23 s to download from a third-party GitHub repo, and a board pasted before then was guessed
  (white board 1 came out as two pawns); this reader takes ~10 ms. Each board goes to its own side by
  its pieces' colour, whichever slot it was pasted into. TensorFlow is no longer loaded (1.4 MB).
  The 10 boards are now fixtures here (`tests/fixtures/chess_white_*.png`, `chess_black_*.png`),
  checked by `tests/chess.test.js`.
- **Mines** says "This Input Solves Mines" (`finishCheck`), as here.
- **Serial bar** under the title, as here: fills The Button, Complex Wires, Venn and Simon Says.
- **Pasted image links were read twice** on 11 tabs (the module's paste handler and the page-wide
  fallback both loaded them; Mines counted two rounds). The fallback now steps aside.
- **Phones:** the page had no viewport tag (drawn at 980 px and shrunk); five tabs ran off the right
  edge; the tab list is one sideways-scrolling row at the top.

## 2026-11-23 — Wire Placement and Laundry modules; Mines says when it's done

- **New module: Wire Placement** (〰️ tab, `src/modules/wireplace/`). Paste this game's table (once
  per game, kept in memory for every Wire Placement card) and the module picture. The colour of the
  wire on C3 picks the table column; a wire is cut when its colour and one of its two ends match a
  row in that column. Both pictures are read from pixels, no OCR: the 4×4 tiles and each wire
  between two pegs (colour and ends) on the module; the badge colours and the cell codes (letters
  A–D and digits 1–4 from templates of the table font) on the table. Checked at 0.6× to 2× size.
  The board is drawn with the cut wires marked; any wire or table cell can be fixed by hand.
  SAMPLE = the 23 Nov game (C3 blue → cut A1-A2 yellow). Copies e.g. `A1-A2 Yellow`, or `NONE`.
- **New module: Laundry** (🧺 tab, `src/modules/laundry/`). The helper manual's formulas change from
  game to game (Load 1's manual had remaining + 5 / solved + needy + 2 / digit + total + 1, Load 2's
  remaining + 3 / + 5 / + 3), so nothing is built in: paste the manual once per game, as text or as
  pictures (both pages at once is fine; read by OCR into the manual box, which can be corrected). The
  formulas, the item / material / color tables, the wash / dry exceptions and the special-care rules
  are all read from it; every value is snapped to a symbol on the sheet, which also mends OCR slips
  (lost arrows, "150*C", "Iltem"). If a pasted manual lacks the tables or rules (only page 1), the
  usual ones (the same in both manuals seen) fill in and the app says so; a table with a row missing
  stops with a message instead of picking the wrong row. Then each load: paste the bot message (its
  text, a screenshot of it, or type the counts). The module picture (alone or inside the screenshot)
  is read for the symbols the tiles show, and each answer says how many presses its button needs,
  taking a press to step to the next symbol in the sheet's order. The module picture stays the same
  through a game's loads, so "next load" keeps those symbols. Each answer shows its symbol;
  "Next check in Ns" counts down from the message. SAMPLE = the 23 Nov Load 1 manual and message
  (Corset / Nylon / Jade Cluster → 30°C, No tumble dry, 150°C, Low heat). Load 2's manual with the same
  counts gives Shorts / Polyester / Malinite → 50°C, Medium heat, 150°C, Non-chlorine bleach.
- **Mines: "THIS INPUT SOLVES MINES".** When every covered square left is a sure mine or one of the
  safe squares about to be clicked, the answer says so (with a note under it). If the only safe
  squares left were handed out in an earlier round, it says which ones finish the board.
- Neither new module is in the level generator yet (it needs board screenshots with their titles).
- **Batteries: when a timer digit shows.** The bomb timer counts down from 8:00 (confirmed in a
  practice run). Each timer-gated module now lists where its digits show, longest first — e.g. a 3:
  3:59→3:00 (a whole minute), x:39→x:30 every minute (10 s), x:x3 every 10 s (1 s, risky with lag).
  The old hint offered x:6x … x:9x, which never happen (seconds stop at 59). Optional live sync:
  press ▶ 8:00 as the bomb starts (or type what the timer shows) and each module says NOW, or when its
  next window comes and how long it lasts, with the next 10-second-or-longer one beside a 1-second one.
- **New module: Battleship** (🚢 tab, `src/modules/battleship/`). Paste the manual text: the
  "Enemy fleet" list (e.g. a 3-cell and a 2-cell ship) is read from it. After each shot, press HIT / MISS (or click any cell: once = miss,
  twice = hit). It counts every way the fleet could still lie (straight, not overlapping, covering
  every hit, no miss, sunk ships wholly on hits) and says which cell to fire at: the one most
  layouts use. Every cell shows its chance, equally good cells are listed (a shot knocks that slot's
  module offline for 20 s, so pick one nobody is working on), and a 20-second wait counts down after
  each shot. In simulated games a 3 + 2 fleet took about 15 shots on average (worst 25); random shots
  take about 30. When a ship sinks, paste the new list or click its chip.
  The board is fixed at 6×6 (A–F × 1–6), the only size seen.
- **Level generator: every title on the 36-module board.** References added from a full board
  screenshot for Wire Placement, Battleship, Bluescreen, Who's On First, Breaker, Echo and The Eye,
  plus board-made ones for Astrology, Blackjack, Hangman, Limbo, Pipes and Balance (whose first
  reference came from a single-module picture and only scored ≈0.8). Bluescreen, Echo and The Eye are
  listed as modules without a solver. The whole board reads right, in order, from 0.5× to 1.8× size.
  Two reading fixes found on the way: titles with a tail below the line (the J in BLACKJACK) are no
  longer dropped as too tall on a resized screenshot, and a weak match alone in its own row (Morse
  Code's small orange READY) is no longer taken for a module.
- **Batteries: wide tables read fully.** On the 23 Nov 20-module table two of the ten rows were lost:
  a long FIRST → THEN arrow across most of a row was taken for a grid line, cutting the row in half.
  Only grey pixels count as grid line now. Also: an arrow running into a FIRST badge (Switches' blue
  one) no longer turns it into ANY, and that table's slightly different digits (0, 3, 4, 5) were
  added as second templates, so they no longer wait for OCR (reading went from 32 s to 13 s).
- **Level generator: red board → Batteries.** A bomb with batteries has a red board (red frame, dark
  red between the cards) instead of a grey one. The generator now sees that — by the frame, or by the
  gaps between cards when the screenshot is cropped inside it — and puts Batteries first in the level,
  tagged "RED BOARD". The 36-module board gives Batteries + its 36 modules; the grey boards don't.
- **Piano: one answer, no increasing / decreasing.** Two answers seen in a game settle it: the answer is
  the distance between the two notes as drawn (G♭2 then E2 in C major → Major 2nd; B♭2 then A♭3 in
  G major → Minor 7th). The two ▲ / ▼ panels are one INTERVAL panel. Once this game's code table is
  pasted it copies the interval with its code ("Minor 7th 3.16"); with the built-in (old) table it
  copies the name only and says to paste the table. Both pictures are tests. Conso's Piano gets the
  same single answer (its logic file regenerated; only Piano changed, plus an added Mines helper).
- **Piano: a drawn ♮ cancels the key.** G♯4 then A♮4 in A♭ major came out "Unison": the reader saw
  the ♮ but stored it as "nothing drawn", so the key turned the A into A♭ (= G♯). A ♮ is now its own
  sign (its left stroke stops short of the bottom, its right one starts below the top) and cancels
  the key for that note → Minor 2nd. Notes show as "A♮4", the fix-up menu has none / ♮ / ♯ / ♭, and
  conso's Piano got the same (its picker gains "♮ Natural"). The picture is a test.
- **Piano: edit the staff like the manual page.** The working panel now draws the staff as read
  (clef, both notes, their ♯ ♭ ♮) next to your pasted picture, so a misread shows at a glance. Tap
  the left half to move note 1, the right half for note 2, the clef to switch treble / bass; under
  each note ♭ ♮ ♯ ✕ (✕ = nothing drawn, the key decides) and ▼ ▲. A note that took its sign from
  the key says "from the key". Works with no picture too: tap both notes (one tap alone gives no
  answer, so no fake "Unison").
- **public/manual_piano_solver.html** (tap-the-staff page, to become Piano's debugging view): same
  rules as the app now — a key field (paste the bot's message or "A♭ Major"), a ♮ button beside ♭ ♯
  and ✕ (= nothing drawn, the key decides), Unison for the same pitch, more than an octave reduced
  instead of "N/A", and a debug line: both note names, half-steps, the key, and which note took its
  sign from the key. Fits a 390 px phone.
- **Wire Placement: Discord screenshots.** A phone screenshot with the module in it now reads too
  (the card is found around its orange WIRE PLACEMENT title). Checked on the 23 Nov screenshot: the
  8 wires match its "Cut …" buttons, and with that game's table the answer is A1-A2 Yellow, D1-D2 White.

## 2026-11-23 — Batteries module; drag and drop no longer stops working

- **New module: Batteries** (🔋 tab, `src/modules/batteries/`). Paste this game's rules table (once
  per game, kept in memory for every Batteries card) and the bomb's batteries picture; it shows the
  order to disarm the modules in. Every row true for those batteries applies: a digit = only while
  that digit is on the timer, ANY = whenever, FIRST → THEN (same colour) = that order. The table is
  read from the picture (grid, badges and pair colours from pixels, digits 0–5 from templates; module
  names, condition words and other digits by OCR); the batteries by label colour, size and shape
  (two terminals = 9V block), voltage from the label. Every cell, row, module name and battery can be
  fixed by hand; a row can be forced true / false. SAMPLE = the 23 Nov game (answer: Symbols with a 3
  on the timer → Search → Rubik's Cube, the rest any time). Not in the level generator yet (needs a
  board screenshot with BATTERIES on it).
- **Drag and drop stopped working until a reload** — mostly with links dragged from Discord, and most
  often in level 6.4 (5 Chess + Knobs). Drops are ignored while "a drag that started on this page" is
  in progress (so dragging selected text or a thumbnail isn't read as a new picture). That was a
  page-wide flag set on `dragstart` and cleared on `dragend`; when the dragged thing was redrawn
  mid-drag its `dragend` never arrived, the flag stayed on, and every link drop after it was refused.
  Now each drag that starts on the page is tagged in its own data, so nothing can get stuck. Fixed in
  the shared drop zone, the 5-board Chess view and the Heist page; checked in the rebuilt `bomb.html`
  opened from disk.

## 2026-11-23 — Diagram follows the serial; no more 403s on drag

- **Diagram: the serial picks the region.** A vowel in the serial (top bar) → the SHADED region is
  answered and auto-copied, no vowel → the UNSHADED one; no serial → shaded. The switch still works
  and overrides it until the serial changes; a line under it says why. An empty diagram is no longer
  copied (its unshaded answer "S" was copied on opening the tab). Same in conso's Venn section, which
  gets a serial field (or uses the one typed in The Button / Complex Wires) and now auto-copies.
- **No 403 errors when dragging a Discord link.** The connection warm-up asked for the bare
  `cdn.discordapp.com/` and `media.discordapp.net/` roots, which answer 403 — two red errors in the
  console on every drag, though the image itself loaded. It now asks for small public files that answer
  200. (A real expired / broken image link answers 404, not 403.)

## 2026-11-23 — Conso's app uses this app's module logic

`node scripts/build-conso-logic.mjs` bundles the module logic (readers + solvers, no React) into
`conso/bomb2.0/bomb-logic.js` as `window.BombLogic.<module>`. Conso's modules call it instead of
keeping their own copies, so re-running the script after a logic change here is the whole sync.
Ported: Morse, Simon, Knobs, Piano, Mines, Queens, Search, Password, Switches, Who's on First, Button,
Complex Wires, Symbols, Logic, Diagram, Maze (this reader first, conso's own when it fails or its
sliders are moved) and Wire Sequences. Each was checked in conso's page with the same pictures as
this app's tests.

## 2026-11-22 — Bomb: module audit (standalone, groups, levels) and fixes

Every bomb module was driven in the real app (headless Chromium against `npm run dev`): standalone,
as a group of 2 cards (all-modules mode and inside a level), and as 2 separate windows in a level —
inputs from real screenshots where there are some, SAMPLE otherwise. All 39 built-in missions open
with every tab rendering and no errors.

- **Simon Says reads the manual table picture.** The table changes every game (no built-in table any
  more): paste it once, every Simon card uses it (in memory only, so a refresh clears it). Images that
  are neither the module nor the manual are ignored.
- **Piano: increasing and decreasing.** Two answers from the first (left) note to the second: ▲ going
  up and ▼ going down (the inversion); the way the notes are drawn is auto-copied. The interval name
  ("Major 6th") is copied, not the code. **Key signature** field: paste the key from the bot's message
  ("E Major", just "E", or the whole message), or pick it from the list (all major / minor keys);
  notes without their own ♯ / ♭ take it. The key is shown on both answers, since it changes every
  stage, and unreadable text clears it. An empty Piano card no longer answers "Unison".
- **Morse: a third reading, ⇄ SWAPPED** (dots and dashes swapped), always shown next to forward and
  backward. A red light makes it the auto-copied one (replaces the swap button).
- **Knobs reads the lamps from pixels** (OCR read every round lamp as "O"); OCR is the last resort.
- **Symbols:** no press order until the puzzle has a grid (an empty count gave "1 2 3 4"); a single
  helper grid pasted into Symbols #2 counts for puzzle #2 (strips still go section #n → puzzle #n).
- **Rubik's Cube sample** is a real 4-move scramble; the old one needed 10+ moves and always timed out.
- **Toasts:** only the needy reminder shows one.
- **Level generator recognises Mines.** Its title used to be read as "Wires" (unsure), so a level
  with Mines got a skipped Wires instead. Reference taken from a board with MINES next to WIRES.

## 2026-11-22 — Heist captcha: half the size, ~2× faster, stricter trust

- **int8 weights:** each weight is stored as 1 byte plus one scale per output channel instead of
  float16. Model 5.66 → 2.87 MB, app build 9.9 → 7.1 MB. Held-out accuracy unchanged (5-fold
  cross-validation, `files(1)/compress_study.py`, results in `files(1)/study/report.md`).
- **Adaptive TTA:** the captcha is read once; only when that read's confidence is under 0.9 are the
  4 shifted reads added. Same accuracy, ~2.2 reads per new captcha instead of 5.
- **Trust threshold 0.5 → 0.95:** on captchas the model never saw, 7.6 % of answers trusted at 0.5
  were wrong; at 0.95 it is 4.5 %, and about 60 % of captchas are still trusted.
- The reader moved out of `heistCore.js` into `src/heist/captcha/captchaVision.js`, the model into
  `captchaSpec.js` (which `train_captcha.py` now writes, int8 by default). Layer sizes the SIMD kernel
  can't run fall back to the JS engine. `tests/captchaVision.test.js` runs the real engine on the
  labelled captchas.

## 2026-11-22 — Morse: red light swaps long and short flashes

- When the transmitter light is **red**, long and short flashes are swapped (a short flash is a
  dash). The light's colour is read from the GIF (the normal light is blue), and a red light is
  undone automatically, with a toast and "⇄ SWAPPED" on both readings.
- A **⇄ SWAP DOT/DASH** button flips it by hand if the colour is misread. The waveform recolours
  to match.

## 2026-11-22 — Knobs reads the manual picture

- The Knobs table (8 X/O patterns for each of UP, DOWN, LEFT and RIGHT) changes every game, and
  the game gives it as a picture. Paste it in the Knobs box, the same box as the LED screenshot.
  All four panels are read, each title from its letters, plus every X and O. The result fills the
  table the solver uses, which shows when it was read.
- The table is shared by every Knobs module on the bomb.
- **Built-in table removed:** an earlier game's table was being used silently. Its first UP row
  was XOXOXX; this game's is OOOOXO.

## 2026-11-22 — Chess: White's and Black's blunder

- Some Chess modules ask for a side's **blunder** instead of its best move. Two more copy boxes
  sit under the best-move ones: **♔ WHITE'S BLUNDER** and **♚ BLACK'S BLUNDER**.
- Stockfish has no "worst move" command, so every legal move is scored at once (MultiPV) and the
  worst-scoring one is the blunder. Walking into a mate counts as worse than losing any amount of
  material, and being mated sooner as worse still. Moves scored exactly as badly (e.g. several
  moves that all allow mate in 1) are listed under the boxes.
- The blunder search runs after the best moves (about 2 s per side), so the best moves show up
  first. Auto-copy is unchanged: it still copies the best move when only one side can be to move.

## 2026-11-22 — Circuit reads the colour legend picture

- The colour → Ω legend changes every game, and the game now gives it as a picture. Paste it on
  the Circuit module (the same box as the circuit; the two kinds of picture are told apart). Each
  chip's colour and value are read and fill the shared colour → Ω table, so every Circuit on the
  bomb uses them. The table records when it was read.
- **Built-in values removed:** an earlier game's values were being used silently. The answer now
  waits for this game's legend.
- **Checking the values:** the values read are listed with a picture of each chip, and an unsure
  one is marked "check". Fix a value in its box, and the digit shapes are learned for next time.
- **How digits are read:** by shape. The real 0, 1, 2, 4, 6, 8 and Ω are built in, and 3, 5, 7
  and 9 come from the 12 downloadable fonts closest to the game's, since its own font isn't a
  known one. With the real shapes hidden, the fonts alone still read every real digit correctly.
- Shared glyph matching moved to `src/utils/glyph.js` (Blackjack uses it too).

## 2026-11-22 — Pipes answers for both turning directions

- Pipes now shows two answers side by side, the same way Chess does: **↻ clockwise** on the left
  and **↺ anticlockwise** on the right, each click-to-copy. Some bombs turn the pipes one way and
  some the other. Both directions reach the same finished board; a colour pressed n times one way
  is pressed 4 − n times the other way (fewer for pieces that look the same after a half turn).
- The colour chips show both counts (↻1 ↺3). An answer is copied automatically only when both
  directions need the same presses; otherwise click the one your bomb uses.

## 2026-11-22 — Blackjack

- **New module: Blackjack.** Paste the helper's picture (your cards, face up) and the defuser's
  (the dealer's up card; it is told apart by its face-down cards), or tap the ranks. It answers
  HIT or STAND by standard basic strategy with only those two moves. There's no manual text yet,
  so this is an assumption. It also shows the hand total, the chance of busting on a hit, and the
  table with the current cell marked.
- **How cards are read:** ranks are matched by shape. The real 5, 6 and 7 are built in, and the
  other ranks come from bold sans-serif fonts, since the game's font isn't known. Across fonts
  102 of 104 ranks get the right value; the misses score low and are marked "check". 10, J, Q
  and K are all worth 10, so mixing those up can't change the answer. A rank you correct is
  learned in the browser.
- The Blackjack title is added to the level generator (approximate, from the module picture).

## 2026-11-22 — Chess asks for White or Black; new Wire Sequences table; Hangman

- **Chess: White's and Black's move side by side**, like Heist's ASC / DESC. The module can ask
  for either side, so both are solved and shown, White on the left and Black on the right; click
  one to copy it. A side whose move is impossible is shown as NOT POSSIBLE, because the side not
  to move can't be in check. When only one side is possible, that move is auto-copied. The 5-Chess
  level (6.4) shows the two halves on every answer row too. Clicking one copies it and marks it, and
  COPY ALL then uses the marked side for that bomb. The built-in answer list is White's only, so it
  is skipped for Black.
- **6.4 drag and drop fixed.** Screenshots dragged from Discord are links, not files, and the two
  drop boxes only took files, so nothing happened. A drop outside the boxes made the browser open
  the image instead. Both now work: a drop anywhere is routed by shape (tall strip = Black).
- **Level generator: Queens and Laundry are recognised** (references from a real board
  screenshot). Approximate references were added for Hangman, Astrology, Pipes, Limbo and Balance,
  taken from their module pictures. A title with no reference used to vanish from the list
  silently; now it is shown as "?" (NOT RECOGNISED — PICK IT).
- **Wire Sequences: the new table** (image manual, same style as the new Simon table) is built in.
  The storage key is now v4, so a text manual saved from an earlier game is no longer used.
- **Hangman reads the defuser's screenshot after each guess.** It finds the blanks (so the word
  length too), which ones show a letter, and how much of the stick figure is drawn. Blanks that
  just filled in are where the guessed letter is. No new letter but a bigger figure means it
  missed. The same picture twice changes nothing, and a different number of blanks starts a new
  bomb. The letter is the one the app suggested (or one you typed first), unless a letter seen
  before is recognised by shape (T is built in; others are learned and kept in the browser). Then
  it tries the only letter the list allows there, and otherwise it asks. Pasting a new manual
  keeps the guesses. With 9 blanks and an 8-letter list it says to paste this bomb's manual.
- **New module: Hangman.** Every letter guess draws a body part, right or wrong, so it suggests the
  letter that narrows the manual's word list down fastest: fewest guesses in the worst case, then
  on average. Tap what the blanks showed; once one word is left it says to guess the whole word.
  With this game's 25 words that is at most 4 letters, 3.3 on average. The full plan is under
  "the whole plan from here". Pasting the manual anywhere replaces the list.

## 2026-11-22 — Pipes; Astrology needs each game's map and list

- **Astrology fix.** The sky map and the star list both change every game, so the built-in ones
  (from the first game) are gone: it only answers once this game's map and list are loaded. Before,
  a new game's bomb was checked against the old map, two buttons matched, and no answer was given.
  An old map could also have made exactly one button match by chance. The module now shows a
  3-step checklist (map, list, screenshot) with when each was loaded, and a NEW GAME button.
  Pasting the star list anywhere on the page loads it, not only in a group of Astrology cards.
  Fixtures from two more games: maps at 1024×607 and 1400×830 (88/88 each) and a bomb that gives
  button 1.
- **New module: Pipes.** Paste the helper's coloured picture. The tile grid, each piece's openings
  and its colour are read, then every combination of 0–3 presses per colour is tried. The answer is
  the one that makes a single network with no loops and no open ends, e.g. "Red ×1, Yellow ×3,
  Green ×3, Blue ×2, Purple ×1". The defuser's grey picture can be pasted too, as a check that the
  pieces match. Tap a tile to fix a misread colour.

## 2026-11-22 — One serial per game, new Simon Says manual

- **Serial in the top bar.** The serial is the same on every bomb in a game, so it is typed once
  next to the needy reminder and used on every mission, custom level and "all modules". It is saved
  across reloads; ✕ clears it for a new game. The Button and Complex Wires serial boxes edit the same
  value (Complex Wires still sets EVEN/ODD from its last digit).
- **Simon Says** uses the new universal manual image instead of pasted text rules: the row comes from
  the serial (vowel / no vowel) and odd / even modules disarmed. Both ODD and EVEN answers are still
  shown. With no serial set, Simon asks for it instead of guessing. The text-manual box is gone.
- **New module: Limbo.** Paste the GIF; the key that glows at the start is followed through every
  swap and its colour in the last frame is copied. Each move is read as pair swaps by scoring every
  pairing of the slots that emptied against the arc the keys travel, so keys crossing in the middle
  don't get mixed up. Works at other capture sizes; tap a key to set the start if the glow is cut off.
  Test fixture: `tests/fixtures/limbo.gif`.
- **New module: Astrology.** Paste the defuser's screenshot: the stars are counted and the 4 button
  symbols are named. The symbols are Denis Moskowitz's public-domain constellation glyphs. All 88 map
  glyphs were checked by eye against his Wikimedia Commons originals, and the built-in references
  are cut from a real sky map (`scripts/build-astrology-refs.mjs`). Every constellation with that
  many stars is looked up on the sky map, and the one button in the same quadrant is the answer.
  If the reads give 0 or 2+ matching buttons it refuses to answer and says why. Paste the helper's
  sky map (wide image) to re-read the quadrants if they change; the star list is editable and
  shared. Star count and button names can be fixed by hand. Tests read the map at 0.8×/1×/1.35×,
  the screenshot at 0.75×/1×/1.5×, and every one of the 88 glyphs placed on a button.

## 2026-11-19 — Faster Discord image links

- Dropping a Discord image (or pasting its link) has to connect to Discord's CDN before the download
  starts. Measured on this connection: ~0.7 s median for a cold connection vs ~0.25 s when a
  connection is already open. Both games now send a tiny warm-up request when a drag carrying a link
  enters the page, when the page gets focus (just before a Ctrl+V), and when the phone paste box is
  focused, at most once every 20 s. A `<link rel=preconnect>` did not help in the same test.
- Bombs: a link download times out after 15 s instead of hanging, sends no cookies or referrer
  (like Heist already did), and the drop box says "Downloading image…" while it downloads.
- Decoding was checked and is not the bottleneck: under 60 ms even for a 2560×1440 screenshot.

## 2026-11-19 — Speed audit, phone fix

### Heist
- **Captcha reader ~12× faster, same answers.** The network now runs in WebAssembly SIMD
  (`src/heist/captcha/captchaKernel.c`, embedded as base64 in `captchaKernelWasm.js`, rebuilt with
  `npm run build:captcha-wasm`). Your model, weights, 5-read averaging and decoding are unchanged; only
  the maths loops moved.
  - Mean time per captcha 925 → 78 ms; first captcha 880 → 63 ms; with the CPU slowed 4× (phone-like)
    2.8–4.3 s → 0.27–0.37 s.
  - Checked on all 515 labelled captchas against the previous version: identical text, puzzle type and
    review flag on every one; largest confidence difference 7.6e-7.
  - Browsers without WebAssembly SIMD (e.g. iPhones before iOS 16.4) use the old JavaScript forward
    pass, bit-identical to before. `CaptchaVision.engine()` says which one is running.
  - Known limit: the SIMD kernel needs every layer's output size to be a multiple of 4. A retrained
    model with other shapes needs a guard that falls back to JavaScript.
- Float16 weights decode through a lookup table instead of `Math.pow` per weight.
- **Caesar letter matcher** and **digit matcher** do the same comparisons with precomputed ink lists and
  padded, pre-shifted templates: 650 → 390 ms per pass over the 33 non-captcha examples, every
  confidence identical. Self-test still 34/34.

### Bombs
- **OCR worker pool.** One shared Tesseract worker could read an image with another module's settings
  when two modules read at once (`setParameters` and `recognize` were separate queued jobs). Each read
  now leases a worker, sets only the settings that differ, reads, and hands the worker back. Up to 3
  workers depending on the device; extra workers start only when a read would have to wait.
  Timeouts start once a worker is leased, so waiting in the queue no longer drops letters.
- Independent reads now run in parallel: Word Search unclear cells and its 4-mode vote, Password's
  missed letters, Who's on First's display and 6 buttons, Balance glyphs and both equation sides.
  Word Search fixtures: same letters, 1,240 → 490 ms.
- Password, Who's on First, Balance, Button and Knobs start the OCR worker when they open.
- **Chess:** a search stops as soon as Stockfish has proven a mate (mate in N at depth ≥ min(12, 2N+2));
  mate-in-1 answers in 8–390 ms instead of 3 s. Other positions still search for 3 s.
- Stockfish is bundled into the build (`src/modules/chess/stockfishSource.js`), so Chess and the
  level 6.4 batch solver work from the single `dist/index.html` without a separate `stockfish.js`.

### App
- **Phone fix: "File couldn't be accessed".** Android opens local files as `content://` addresses, and
  adding `?play=heist` pointed at a file that doesn't exist. The game choice is now in the hash
  (`#play=heist` / `#play=bomb`); old `?play=` links still work.
- Tesseract.js pinned to 5.1.1; the CDN scripts load with `defer` so they no longer block the 9.6 MB page.

### Repo
- `tests/captchaKernel.test.js`: the WebAssembly kernels against plain-JS maths (45 tests total).
- `docs/ml-roadmap.md`: plan for making the captcha model itself cheaper (held-out split, fewer TTA
  reads, smaller model / distillation, quantisation).
- `train_and_patch.py`: train, export and patch pipeline for the captcha model.

## 2026-11-19 — Heist/Bombs chooser, Circuit module, retrained captcha model (c7b725c)
- Start page asks Heist or Bombs; each game loads alone. Heist ported into `src/heist/`.
- New Circuit module: reads resistors, wires and terminals and solves the network exactly.
- Captcha model retrained (hard-character oversampling, 5-read averaged decoding, threshold 0.5);
  cross-validation 83.5 % → 86.0 %.
- Search letters matched by shape; Balance handles wrapped equations, subscripts and brackets.
- Level 6.4 opens the batch chess solver.

## 2026-11-18 — Tester feedback, grouped modules, phone support (a67e820)
- Simon, Wire Seq, Logic, Search, Maze, Diagram, Symbols and Balance solver fixes.
- Copies of Maze, Symbols, Diagram and Chess share one page; 2–3 cards across on a laptop.
- Phones: dropdown module tabs under 700 px, paste box in every drop area.

## 2026-11-10 — Shared manuals, Password rows, hand-built levels (c67594c)
- Modules sharing one manual show as one window with a card per copy; manuals shared live.
- Password reads a screenshot row; Generate Level builds a level by clicking modules.

## 2026-11-10 — Audit fixes (8b71408)
- Mines solver: pruned backtracking per independent group instead of 2ⁿ brute force.
- Chess searches from different windows queue instead of cancelling each other; OCR and async
  result races fixed.
