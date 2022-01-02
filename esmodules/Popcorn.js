import { PopcornInterruptHandler } from "./PopcornInterruptHandler.js";

class PopcornViewer extends Application {
  super(options) { }

  timesGetDataHit = 0;
  interruptWindowLength = 5000;
  interruptCycleInProgress = false;

  activateListeners(html) {
    super.activateListeners(html);
    const nominateButton = html.find("button[name='nominate']");
    nominateButton.on("click", event => this._onClickNominate(event));

    const nextRoundButton = html.find("button[name='nextRound']");
    nextRoundButton.on("click", event => this._onClickNextRound());

    const endCombatButton = html.find("button[name='endCombat']");
    endCombatButton.on("click", event => this._onClickEndCombat());

    const interruptButton = html.find("button[name='interrupt']");
    interruptButton.on("click", event => this._onClickInterrupt());
  }

  async _onClickNominate(event) {
    //console.log("Event target id "+event.target.id);

    const tokenId = event.target.id;
    let combatant = game.combat.getCombatantByToken(tokenId);

    await combatant.setFlag('world', 'nominatedTime', Date.now());
    combatant.update();
  }

  async onUpdateCombatant(combatant) {
    if (!this.interruptCycleInProgress && combatant.getFlag('world', 'nominatedTime')) {
      this.interruptCycleInProgress = true;
      await this.runInterruptCycle(combatant);
      this.interruptCycleInProgress = false;
    }
  }
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runInterruptCycle(combatant, startTime) {
    let waited = 0;
    while (waited < this.interruptWindowLength) {
      this.render(true);
      await this.sleep(500);
      waited += 500;
    }
    let interruptHandler = new PopcornInterruptHandler(combatant);
    await this.updateInitiative(interruptHandler.resolveInterrupt());
    await combatant.unsetFlag('world', 'nominatedTime');
  }

  async updateInitiative(combatant) {
    let currentInit =
      game.combat.current.turn == 0 ? 999
        : game.combat.combatants.find(c => c.id == game.combat.current.combatantId).initiative;

    await game.combat.setInitiative(combatant.id, currentInit - 1);
    await combatant.update();

    // builtin combat.nextTurn assumes a pre-sorted turn order, so let's give it one
    game.combat.turns.sort(function (a, b) { return (a.initiative > b.initiative) ? -1 : ((b.initiative > a.initiative) ? 1 : 0); });
    await game.combat.update();
    await game.combat.nextTurn();

    await ChatMessage.create({
      content: `${combatant.token.name} is acting now.`,
      speaker:
      {
        alias: "Game: "
      }
    });
    // await game.socket.emit("module.Popcorn", { "hasActed": true });
  }

  async _onClickNextRound() {
    await this.resetInitiative();
    game.combat.nextRound();
    ChatMessage.create({ content: "Starting a new Round.", speaker: { alias: "Game: " } })
  }

  async _onClickEndCombat() {
    await this.resetInitiative();
    game.combat.endCombat();
    ChatMessage.create({ content: "Ending the Encounter.", speaker: { alias: "Game: " } })
  }

  async _onClickInterrupt() {
    //TODO: Implement this lol
  }

  async resetInitiative() {
    let combatants = game.combat.combatants.filter(c => c.name != "Placeholder");
    for (let c of combatants) {
      await game.combat.setInitiative(c.id, 0);
      await c.unsetFlag('world', 'nominatedTime');
      await c.update({ initiative: this.initiative });
    }
  }
  static prepareButtons(hudButtons) {
    let hud = hudButtons.find(val => { return val.name == "token"; })

    if (hud) {
      hud.tools.push({
        name: "PopcornInitiative",
        title: "Pop-out popcorn initiative tracker",
        icon: "fas fa-bolt",
        onClick: () => {
          const delay = 200;

          let opt = Dialog.defaultOptions;
          opt.resizable = true;
          opt.title = "Popcorn Initiative Tracker";
          opt.width = 400;
          opt.height = 500;
          opt.minimizable = true;

          var viewer;
          viewer = new PopcornViewer(opt);
          viewer.render(true);

          game.system.popcorn = viewer;
          game.socket.on("module.Popcorn", data => viewer.render(false))
        },
        button: true
      });
    }
  }

  getData() {
    let content = { content: `${this.preparePopcorn()}` }
    //console.log(`getData hit: ${++this.timesGetDataHit}`);
    return content;
  }

  preparePopcorn() {
    //console.log("PreparePopcorn called");
    //Get a list of the active combatants
    if (!game.combat.combatants.find(c => c.name == "Placeholder")) {
      const toCreate = [];
      toCreate.push({ actorId: this.id, hidden: true, name: "Placeholder" });
      game.combat.createEmbeddedDocuments("Combatant", toCreate);
      game.combat.update();
    }
    if (game.combat.turn != null) {
      let contents = `<h1>Round ${game.combat.round}</h1>`;
      contents += this.prepareNominee();
      if (game.combat.current.turn > 0) {
        contents += this.prepareCurrentTurn();
      }
      contents += this.prepareRemainingCombatants();
      return contents;
    } else { return "<h1>No Conflicts Detected!</h1>" }
  }
  prepareNominee() {
    var nominatedTime;
    var nominee;

    // we're looping so we can assign multiple easily
    for (let c of game.combat.combatants) {
      nominatedTime = c.getFlag('world', 'nominatedTime');
      if (nominatedTime) {
        nominee = c;
        break;
      }
    }

    if (nominee) {
      let interruptTimeRemaining = Math.ceil(this.interruptWindowLength / 1000 - (Date.now() - nominatedTime) / 1000);
      return `<h2>Current Nominee... Going in ${interruptTimeRemaining}</h2>
      <table border="1" cellspacing="0" cellpadding="4">
      <tr>
        <td style="background: black; color: white;"/>
        <td style="background: black; color: white;">Character</td>
        <td style="background: black; color: white;">Init. Points</td>
      </tr>
      <tr>
        <td width="70"><img src="${nominee._token.actor.img}" width="50" height="50"></img></td>
        <td>${nominee._token.name}</td>
        <td>${nominee.getFlag('world', 'availableInterruptPoints')} / ${nominee.getFlag('world', 'interruptPoints')}
      </tr>
      </table>`;
    }
    else { return ``; }

  }
  prepareCurrentTurn() {
    let currentCombatant = game.combat.combatants.get(game.combat.current.combatantId);
    return `<h2>Current Turn</h2>
      <table border="1" cellspacing="0" cellpadding="4">
      <tr>
        <td style="background: black; color: white;"/>
        <td style="background: black; color: white;">Character</td>
        <td style="background: black; color: white;">Init. Points</td>
      </tr>
      <tr>
        <td width="70"><img src="${currentCombatant._token.actor.img}" width="50" height="50"></img></td>
        <td>${currentCombatant._token.name}</td>
        <td>${currentCombatant.getFlag('world', 'availableInterruptPoints')} / ${currentCombatant.getFlag('world', 'interruptPoints')}
      </tr>`;
  }
  prepareRemainingCombatants() {
    var combatants = game.combat.combatants;
    var viewer = viewer;

    //Create a header row
    let rows =
      [`<h2>Remaining Combatants</h2>
      <tr>
          <td style="background: black; color: white;"/>
          <td style="background: black; color: white;">Character</td>
          <td style="background: black; color: white;">Init. Points</td>
          <td style="background: black; color: white;">Nominate?</td>
      </tr>`];

    let currentCombatant = game.combat.combatants.get(game.combat.current.combatantId);
    let canNominate = true;
    if (!game.user.isGM) {
      let userCombatant = game.combat.combatants.find(c => c.actor.id == game.user.character.id);
      canNominate = userCombatant && currentCombatant.actor && currentCombatant.actor.id == userCombatant.actor.id;
    }

    combatants.forEach(c => this.prepareCombatant(c, rows, canNominate));

    let myContents = `<table border="1" cellspacing="0" cellpadding="4">`;
    rows.forEach(element => myContents += element)
    myContents += "</table>"
    if (game.user.isGM) {
      myContents += `<button type ="button" name="nextRound" onclick="">Next Round</button></br>`
      myContents += `<button type ="button" name="endCombat" onclick="">End the Encounter</button>`
    }
    return myContents;
  }

  // This function prepares the contents of the popcorn initiative viewer
  // Display the current Round number
  // Display the actor icon of each combatant for which hasActed is false or undefined.
  // Display the name of each combatant for which hasActed is false or undefined.
  // Display a button that says 'Nominate'
  // At the end of the display of buttons etc. display a button that says 'next Round'.

  prepareCombatant(combatant, rows, canNominate) {
    let foundToken = combatant.token;
    if (!foundToken) { return; }
    if ((combatant.hidden || foundToken.data.hidden) && !game.user.isGM) {
      return;
    }

    let isCurrentCombatant = combatant.id == game.combat.current.combatantId;
    let disabledString = !canNominate ? "disabled" : "";

    if (
      (combatant.initiative == 0 && !isCurrentCombatant) || game.combat.current.turn == 0) {
      let addString = `
        <tr>
          <td width="70"><img src="${foundToken.actor.img}" width="50" height="50"></img></td>
          <td>${foundToken.name}</td>
          <td>${combatant.getFlag('world', 'availableInterruptPoints')} / ${combatant.getFlag('world', 'interruptPoints')}
          <td><button type="button" id="${foundToken.id}" name="nominate" onclick='' ${disabledString}>Nominate</button>
        </td>
      </tr>`;

      rows.push(addString);
    }
  }

  static async onCreateCombatant(combatant) {
    if (combatant.name == "Placeholder") {
      await game.combat.setInitiative(combatant.id, 999);
    } else {
      await this.initInterruptPoints(combatant);
      await game.combat.setInitiative(combatant.id, 0);
    }
  }

  static async initInterruptPoints(combatant) {
    await combatant.setFlag('world', 'interruptPoints',
      Math.max(combatant._token._actor.data.data.abilities.dex.mod, 1));

    await combatant.setFlag('world', 'availableInterruptPoints',
      Math.max(combatant._token._actor.data.data.abilities.dex.mod, 1));
  }
}

export { PopcornViewer };

Hooks.on('createCombatant', function (combatant) { PopcornViewer.onCreateCombatant(combatant) });
Hooks.on('updateCombatant', function (combatant) { game.system.popcorn.onUpdateCombatant(combatant) }); 

Hooks.on('getSceneControlButtons', function (hudButtons) {
  PopcornViewer.prepareButtons(hudButtons);
})

Hooks.on('renderCombatTracker', () => {
  if (game.system.popcorn != undefined) setTimeout(function () { game.system.popcorn.render(false); });
})
Hooks.on('updateToken', (scene, token, data) => {
  if (data.hidden != undefined) {
    if (game.system.popcorn != undefined) setTimeout(function () { game.system.popcorn.render(false); });
  }
})