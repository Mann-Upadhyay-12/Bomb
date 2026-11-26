// The bomb app's changelog, shown under About → CHANGELOG (like the Heist page's).
// Written for players: what changed for them, newest first. CHANGELOG.md has the full details.
// Add a line here whenever a bomb change ships.
export const BOMB_CHANGELOG = [
  {
    date: '26 Nov',
    items: [
      ['Rooms are much faster', 'what you paste or tap now goes straight to your teammates over the live connection, from the server nearest each of you, instead of through the site\'s server first. The site still saves everything for reloads and late joiners.'],
      ['Module settings are shared in a room', 'Complex Wires\' EDGE CONDITIONS, rules and wire switches, the Knobs lights and disarmed count, and the modules ticked in Bluescreen now change for everyone in the room as you tap them.'],
      ['"# " before copied answers is off by default', 'copied answers no longer start with "# " unless you tick it in Settings. If you ticked it (or unticked it) before, your choice stays, and whatever you pick is kept on this device until you change it.'],
      ['Rooms play the host\'s level', 'make a room while on a level (1.2, or one you made with GENERATE LEVEL) and everyone who joins opens that level instead of all the modules; make it in ALL MODULES and they get all modules. When the host picks another level, everyone goes with them. You can still look at another level yourself: the room panel shows the room\'s level and a GO TO IT button.'],
      ['Memory and Simon: one drop, one stage', 'a picture dropped on the module\'s card but outside its picture box was taken twice, so Memory saved a stage twice (stage 2 answered as stage 3) and Simon added the same GIF as two stages. It is taken once now. Memory also goes by the stage lights on the picture: one lit light is stage 2 whatever was pasted before, and the same picture pasted again changes nothing. A Simon GIF of a stage already in the list replaces it instead of adding one.'],
      ['No login needed', 'the solver now opens for everyone, no Discord login. A login is only needed for rooms (👥 ROOM → LOG IN WITH DISCORD); an invite link keeps its room through the login.'],
      ['⚑ WRONG ANSWER? for everyone', 'anyone can send a wrong answer to the owner now, logged in or not (up to 10 an hour without a login).'],
      ['Mines', 'a 5 is no longer read as a 3. The game\'s 5 is a darker red than its 3, and the app read both as 3, so it could call squares next to a 5 safe. If a board still reads wrong, press ⚑ WRONG ANSWER?.'],
      ['Rooms: answers board, kick, shared taps', 'the room panel lists every module\'s answer from every player: "✓ 2 agree", or each answer in red when two apps disagree (a misread picture on one side); tap a row to open that module. The host can remove a player (✕). Battleship\'s hits and misses, Piano\'s clef and key, the Diagram SHADED / UNSHADED switch and Laundry\'s counts are shared too, so a tap on one phone shows on the others.'],
      ['Rooms: play one bomb together (new)', 'press 👥 ROOM in the top bar to make a room for 2, 3 or 4 players, then 📋 COPY INVITE and paste it in Discord; friends open the link (or type the code) to join. In a room everyone gets what anyone pastes: the serial, every manual and word list, the module counts, and each module\'s pictures in the same card (Password #2 is everyone\'s Password #2), so the helper pastes the manuals, the defuser pastes the modules, and everyone\'s app shows the answers. A card\'s CLEAR clears it for the room. Only the host starts a NEW GAME, for everyone. Solo play works as before.'],
    ],
  },
  {
    date: '25 Nov',
    items: [
      ['Several of the same module', 'Wires, Memory, Echo, Balance, Limbo, Pipes, Blackjack and Hangman now open as one page with a card per copy, like Password: pick how many under MODULES TO SOLVE (a level picks it for you). Wires, Memory, Echo and Hangman share one manual — paste it once (Ctrl+V anywhere) and every card uses it; the others are independent, a picture or GIF per card.'],
      ['Switches', 'answers as soon as it has the switches, in any order: paste the picture first and the forbidden list after (or the other way round) and it solves again by itself — no SOLVE button. Paste the Helper\'s forbidden list anywhere on the page; it finds the UDDUD states in any wording.'],
      ['Tidier new modules', 'Blackjack, Battleship, Batteries, Wire Placement and Laundry lay out like the older modules: their settings sit in a panel, Laundry\'s manual folds into a one-line 📖 MANUAL bar once loaded (edit opens it), and Blackjack has a SAMPLE.'],
      ['Wires, Memory and Echo (new)', 'three modules the app didn\'t have. Wires: paste the manual\'s 3–6 wire lists once, then the Wires picture: it reads every wire\'s colour (black ones too) and says which one to cut. Memory: paste the manual once, then each stage\'s picture: it reads the display and the four buttons and remembers every press for the later stages. Echo: paste the word list once, then each picture: it reads the word and copies its pair. These manuals haven\'t been seen yet, so if a rule shows as ⚠ unclear, send the manual.'],
      ['Bluescreen (new, needy)', 'when the screen crashes, paste the bot\'s crash message (or the crash picture: it reads the error number) and it applies the rules with the serial from the top bar: "power cycle the 2nd disarmed module". In a level, tap the modules that were disarmed at the crash and it names the module ("Maze"). With one disarmed module the answer is that one straight away.'],
      ['Balance', 'reads all 15 game pictures players sent, including "HCl + Cu(OH)₂ → CuCl₂ + H₂O", "K + H₂O", "Li₂O + HCl", "NiO + HCl" and "Cr(OH)₃" (H₂O read as "HgO" before), and many equations like them: Cu / Au / Mn / Zn letters that touch, a curled "l" before a small number (Cl₂, AlCl₃), Li / Ni / Si, Mg / Ag / Hg, CH₄ / NH₄ / SO₄, "Cl" letters that touch. A reading that balances but can\'t be right (a small number missing, an element puzzles never use, "Cl12") is no longer taken as the answer: it is shown with a warning to check it against the picture.'],
      ['Cyberpunk 2077 theme', 'the backdrop is now the Samurai picture (it replaces the skyline drawing). Settings → THEME & COLORS → Dim dims it like your own background picture, and a background picture of your own still replaces it. Heist\'s Cyberpunk theme has it too.'],
      ['Astrology', 'a star list that spells a name a little differently is read now: this game\'s list says "Chameleon" (the first game\'s said Chamaeleon) and it showed "not recognised: Chameleon". A name one or two letters off is matched to the one constellation it is closest to, never guessed between two. A sky map whose orange borders came through faded is read right too: the borders were read as 4 extra symbols and Vela went missing.'],
    ],
  },
  {
    date: '24 Nov',
    items: [
      ['Logic', 'a false result is now a red chip, and its copy button is red too (true ones stay green), instead of a FALSE word above it. The P–T values are kept after a reload until New game, and a phone\'s copy of them from Discord (with the **bold** marks) is read. The workbench shows each formula with every letter green or red by its value, so a misread letter stands out. A stage that needs an earlier one says it is waiting for it. ⇒, &&, ||, * and + are understood as →, ^, V.'],
      ['Yuza and Dixie themes', 'two new themes in Settings → THEME & COLORS (and in Heist\'s Theme Colors), named after the site\'s first two players. Yuza: mainly black with blood red and purple, a vampire night with a full moon, bats, a cathedral and roses. Dixie: light blue and lavender, a starry night above the clouds. Their names are in About → Credits too.'],
      ['Faster', 'opening the missions sidebar, switching modules and opening Settings no longer redraw every module you have open, so they respond right away even late in a game. Hangman opens about 3× faster (same answers).'],
      ['Manuals on phones', 'every manual picture now has its own 📖 box on a phone, right where the module asks for it: long-press it → Paste the manual\'s Discord link (or the picture). On a computer you paste a manual anywhere on the page, but a phone has nowhere to paste outside a box, so the manual link had no obvious home. Knobs, Simon, Astrology sky map, Laundry, Batteries, Wire Placement, Symbols, and the Wire Sequences / Circuit / Maze manual bars. A box in a card loads into that card; the bar\'s box into the selected card. A link pasted into a manual\'s text box (also on a computer) now loads the picture instead of becoming text.'],
      ['Cyberpunk 2077 theme', 'a new theme in Settings → THEME & COLORS (and in Heist\'s Theme Colors), in the game\'s own colours: yellow #FCEE0A, cyan #00F0FF and red #FD0130 from cyberpunk.net, the menus\' red text and near-black from the game. Rajdhani lettering, square panels with a red corner, cut-corner buttons, cyan drop boxes, and a Night City skyline with scanlines behind the page. A background picture of your own replaces the skyline; changing a colour by hand turns the look off.'],
      ['Mines', 'the last step of a board can be settled by the mine count: the game always hides 16 mines. When the numbers allow two layouts (like "J7 is a mine, or else J5 and J8 are"), the one with 16 mines is the answer, and a note says which squares only the count decided. MINES shows how many of the 16 are found; if a reading can\'t hold 16 mines, a warning asks you to check the board.'],
      ['Button', 'rules that compare two kinds of serial character are understood now: "serial has at least as many letters as digits" was shown as ⚠ unclear. Also "more / fewer … than …", "no more … than …", "as many … as …", "the same number of … and …", for letters, digits, vowels, consonants and odd / even digits.'],
      ['Hangman', 'a screenshot with no letter filled in now counts as a miss even when it is the first one you paste: after a first guess that missed (just the head drawn), the guessed letter is marked as not in the word, so you no longer have to tap "No X" by hand.'],
      ['Auto-copy', 'an answer that arrives after you have left the page (a manual still being read when you went to Discord) is no longer copied over what you copied there — pasting a manual used to put the previous stage\'s answer in instead. The answer says ⚠ NOT COPIED — CLICK HERE; one click copies it. While you stay on the page, auto-copy works as before.'],
      ['Balance', 'the equation reader handles pictures of any size much better. Touching letters are pulled apart ("Al", "i(", "CO" were read as one letter); a small ₈ is no longer read as 6; a subscript glued to the line\'s last letter is cut off ("CO₂ +" before a wrap read as "CO"); a full-height P is no longer "p". When no reading balances, one or two characters OCR often confuses (a ₃ read as S or g, an unread digit, a lost bracket) are swapped for the version that balances, and the status line says so. If several different fills would balance it doesn\'t guess: you get the "doesn\'t balance" warning instead.'],
      ['Batteries', 'the table reader no longer turns a 3 into an 8 ("Under 3V total" read as "Under 8V") or 4.5V into 4.6V: the condition words are now cut out of the picture so bold white text keeps its shape. A short "Has" / "No" row with one letter misread ("Hag") is still understood, and a voltage no batteries can add up to (anything but 1.5, 3, 4.5, 6, …) gets "⚠ check the number".'],
      ['Laundry', 'a Load 1 answer now always says how many presses each button needs, also without the module picture: Load 1 always starts on 30°C, High heat, 150°C, Bleach, and each press steps to the next symbol in the sheet\'s order (both confirmed by players\' worked example: 40°C, Low heat, Iron, Non-chlorine bleach = 1, 4, 2 and 11 presses).'],
      ['Theme & colors', 'Settings → THEME & COLORS replaces CUSTOMIZE BACKGROUND, like Heist\'s Theme Colors: a background colour now recolours the panels, borders and text too (a light colour gets dark text), plus an accent colour, 10 ready themes (Midnight, Parchment, Slate, Forest, Wine, Ocean, Violet, Paper, Sand, Mint), a checked picture link with a Dim slider, and Reset all colors. The accent reaches every highlight and glow, and 5-Chess follows the theme too.'],
      ['Chess', 'fixed a wrong answer now and then (like c4 for Black where Qc1# was mate): when a solve was replaced by a new one (the second picture arriving while it still thought), a search could get the move of the search before it. Each search now waits for its own answer from Stockfish, and a move that is not legal on its board is never shown.'],
      ['5-Chess (level 6.4)', 'every answer comes from Stockfish now (the old CSV answer book is gone), through the same fixed engine as Chess.'],
      ['Diagram', 'the serial no longer picks SHADED / UNSHADED: the switch does, SHADED to start.'],
      ['Search', 'the word list is now the full 628-word bank (it had 48 words), for everyone. Each device starts from the new list; edits in the box are still saved.'],
      ['New game', 'one button in the top bar (and in Settings) forgets everything that changes per game: the serial, the Astrology map and list, the Circuit / Knobs / Wire Sequence / Piano / Simon / Batteries / Wire Placement / Laundry tables, the Button checklist, the Hangman list, the maze strip, the Symbols grids and every screenshot. Press it twice: a single press does nothing.'],
      ['More settings', 'needy reminder 3, 5, 8 or 10 seconds before each 30-second mark, with an optional beep (▶ Test beep). Choose which modules the picker shows (levels still show all of theirs). The page opens on the module you used last (can be turned off). Working panels: as each module sets them, always open or always closed.'],
      ['Phones', 'every module checked on a phone. Bigger buttons, and text boxes that no longer zoom the page on an iPhone. The answer says TAP TO COPY, COPIED ✓, or ⚠ NOT COPIED when the phone refused the auto-copy (iPhones only copy on a tap). The maze has a START / GOAL switch, since phones have no right-click. The maze, chess and Who\'s on First boards fit the screen. Paste boxes say how to paste on a phone. Knobs and Battleship manuals copied on a phone are read too.'],
      ['Settings', 'Auto-copy answers (COPY ON DECODE): one switch for every module and Heist, remembered on this device. Untick it in About & Settings to keep it off.'],
      ['Manuals on phones', 'a list copied from Discord on a phone (like the Astrology star list) comes with Discord\'s ** marks, so it wasn\'t read and step 2 stayed red. Now it is, wherever you paste it, for every pasted manual. On a phone the 📖 MANUAL box opens by itself until a manual is loaded.'],
      ['Website', 'log in with Discord to use the solver on the website. The page only runs there: a saved copy shows a message instead of the app.'],
      ['Phones', 'picking Heist or Bombs, and the ⇄ HEIST / BOMBS link, no longer reload the page. A phone opening the downloaded .html may refuse to read the file a second time, so the page never got past the choice. The back button now goes back to the choice too.']
    ]
  },
  {
    date: '23 Nov',
    items: [
      ['Needy reminder', 'now a notification, so it shows over Discord or any other window, 5 seconds before each 30-second mark (the countdown still restarts every 30 s). Allow notifications when the browser asks; if they are blocked, the old pop-up is used and the button shows 🔕.'],
      ['New modules (in progress)', 'Wire Placement, Laundry, Batteries and Battleship. Wire Placement: paste this game\'s table once, then the module picture, and it lists the wires to cut. Laundry: paste the manual once per game, then each load\'s bot message. Batteries: paste the rules table and the batteries picture for the order to disarm the modules in, and when each timer digit shows. Battleship: paste the fleet list, mark hits and misses, and it says where to fire next.'],
      ['Logic', 'a false result says FALSE above it in red, so α=F can\'t be mistaken for a true one. A stage that is only β (nothing else in the grid) was read as Q; fixed.'],
      ['Symbols', 'the defuser\'s picture is read right with the mouse cursor on a tile, in small or blurry screenshots (☆ was read as Ω, © as Ѿ), and with © in a big screenshot (it read the wrong order). Checked on 46 real keypads.'],
      ['Mines', 'says "THIS INPUT SOLVES MINES" when the squares it gives finish the board.'],
      ['Piano', 'one answer: the distance between the two notes as drawn. Once this game\'s code table is pasted, it copies the interval with its code. A drawn ♮ now cancels the key (G♯4 then A♮4 in A♭ major was "Unison", now Minor 2nd). The staff is drawn as it was read: tap it to move a note or change its ♯ ♭ ♮.'],
      ['Diagram', 'the serial picks the region: a vowel → shaded, no vowel → unshaded. An empty diagram is no longer copied.'],
      ['Level generator', 'reads every title on the 36-module board, and a red board (a bomb with batteries) puts Batteries first.'],
      ['Drag and drop', 'no longer stops working until a reload (mostly Discord links, in level 6.4).']
    ]
  },
  {
    date: '22 Nov',
    items: [
      ['One serial per game', 'typed once in the top bar and used by every module, mission and level. It is kept across reloads; ✕ clears it for a new game.'],
      ['New modules', 'Limbo (paste the GIF: the glowing key is followed through every swap), Astrology (paste this game\'s sky map and star list, then the defuser\'s screenshot), Pipes (paste the helper\'s coloured picture; answers for both turning directions, ↻ and ↺), Hangman (suggests the letter that narrows the word list fastest, and reads the defuser\'s screenshot after each guess) and Blackjack (HIT or STAND from both pictures).'],
      ['Chess', 'White\'s and Black\'s move side by side, plus each side\'s blunder (its worst move). A side that can\'t be to move shows NOT POSSIBLE.'],
      ['Manuals that change every game', 'are read from their pictures: Simon Says, Knobs and Circuit\'s colour legend. The old built-in tables are gone, so an earlier game\'s table is never used by mistake.'],
      ['Morse', 'a red light swaps long and short flashes, and that is undone automatically. The ⇄ SWAPPED reading is always shown too.'],
      ['Also', 'the new Wire Sequences table is built in; Piano has a key signature field (paste the bot\'s message or pick the key); Knobs reads its lamps from pixels; Symbols and the Rubik\'s Cube sample fixed; the level generator recognises Mines, Queens and Laundry, and shows "?" for a title it can\'t read instead of dropping it; pop-ups removed except the needy reminder.']
    ]
  },
  {
    date: '19 Nov',
    items: [
      ['Start page', 'asks Heist or Bombs; each game loads on its own.'],
      ['New module', 'Circuit: reads the resistors, wires and terminals and solves the network exactly.'],
      ['Speed', 'Discord image links start downloading sooner, and a stuck download gives up after 15 s ("Downloading image…" shows meanwhile). Text reading runs in parallel without mixing up modules (Word Search about 2.5× faster). Chess answers a mate in 1 in under half a second, and Stockfish is built in.'],
      ['Also', 'Search letters are matched by shape; Balance handles wrapped equations; level 6.4 opens the 5-board chess solver; phones no longer say "File couldn\'t be accessed".']
    ]
  },
  {
    date: '18 Nov',
    items: [
      ['Tester feedback', 'fixes for Simon, Wire Sequences, Logic, Search, Maze, Diagram, Symbols and Balance.'],
      ['Grouped modules', 'copies of Maze, Symbols, Diagram and Chess share one page, 2–3 cards across on a laptop.'],
      ['Phones', 'module tabs become a dropdown under 700 px, and every drop area has a paste box.']
    ]
  },
  {
    date: '10 Nov',
    items: [
      ['Shared manuals', 'modules that share one manual show as one window with a card per copy.'],
      ['Password', 'reads a screenshot row. Generate Level builds a level by clicking modules.'],
      ['Fixes', 'Mines solves much faster; Chess searches from different windows wait their turn instead of cancelling each other.']
    ]
  }
];
