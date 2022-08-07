import { PopcornInterruptHandler } from "./PopcornInterruptHandler.js";

class PopcornViewer extends Application {
  timesGetDataHit = 0;
  interruptWindowLength = 10000;
  interruptCycleInProgress = false;
  interruptHandler;

  constructor(options){
    super(options);
    // if (game.user.isGM) {
    //   game.socket.on('module.Popcorn', PopcornViewer._onRegisterInterrupt);
    // }
  }

  activateListeners(html) {
    super.activateListeners(html);
    const nominateButton = html.find("button[name='nominate']");
    nominateButton.on("click", event => this._onClickNominate(event));

    const nextRoundButton = html.find("button[name='nextRound']");
    nextRoundButton.on("click", event => this._onClickNextRound());

    const endCombatButton = html.find("button[name='endCombat']");
    endCombatButton.on("click", event => this._onClickEndCombat());

    const interruptButton = html.find("button[name='interrupt']");
    interruptButton.on("click", event => this._onClickInterrupt(event));    
  }

  getInterruptHandler(combatant) {
    if (!game.system.popcorn.interruptHandler) {
      if (!combatant)
        combatant = game.combat.combatants.find(c => c.id == game.combat.current.combatantId);
      game.system.popcorn.interruptHandler = new PopcornInterruptHandler(combatant);
    }
    return game.system.popcorn.interruptHandler;
  }
  async _onClickNominate(event) {
    const tokenId = event.target.id;
    let nominee = game.combat.getCombatantByToken(tokenId);
    await nominee.setFlag('world', 'nominatedTime', Date.now());
    await nominee.update();
  }

  async onUpdateCombatant(combatant) {
    if (!this.interruptCycleInProgress && combatant.getFlag('world', 'nominatedTime')) {
      this.interruptCycleInProgress = true;
      await this.runInterruptCycle(combatant);
      this.interruptCycleInProgress = false;
    }
    this.render(true);
  }
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runInterruptCycle(combatant, startTime) {
    // This one kicks off the whole thing so we need a new handler
    game.system.popcorn.interruptHandler = new PopcornInterruptHandler(combatant);
    let handler = game.system.popcorn.interruptHandler;

    let waited = 0;
    while (waited < this.interruptWindowLength) {
      this.render(false);
      await this.sleep(1000);
      waited += 1000;
    }
    // Let Server handle resolution so we don't attempt multiple writes  
    if (game.user.isGM) {
      let winner = await handler.resolveInterrupt();
      await this.updateInitiative(winner);
      await combatant.unsetFlag('world', 'nominatedTime');

      // Unset interrupt attempt flags for the next go around  
      await handler.clearFlags();
      combatant.update();
    }

    // Unset interrupt attempt flags for the next go around 
    await handler.clearFlags();
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
  }

  // No GM check needed since this button is only exposed to GM
  async _onClickNextRound() {
    await this.resetInitiative();
    await this.getInterruptHandler().clearFlags();
    game.combat.nextRound();
    ChatMessage.create({ content: "Starting a new Round.", speaker: { alias: "Game: " } })
  }

  async _onClickEndCombat() {
    // these calls are safe since only the DM can click this button 
    await this.resetInitiative();
    await this.getInterruptHandler().clearFlags();
    game.combat.endCombat();
    ChatMessage.create({ content: "Ending the Encounter.", speaker: { alias: "Game: " } })
  }

  async _onClickInterrupt(event) {
    const tokenId = event.target.id;
    let combatant = game.combat.getCombatantByToken(tokenId);
    await game.system.popcorn.getInterruptHandler().registerInterrupt(combatant);
  }

  async resetInitiative() {
    let combatants = game.combat.combatants.filter(c => c.name != "Placeholder");
    for (let c of combatants) {
      await game.combat.setInitiative(c.id, 0);
      await c.unsetFlag('world', 'nominatedTime');
      await c.update({ initiative: this.initiative });
    }
  }
  static getDefaultViewer(){
    let opt = Dialog.defaultOptions;
    opt.resizable = true;
    opt.title = "Popcorn Initiative Tracker";
    opt.width = 400;
    opt.height = 500;
    opt.minimizable = true;

    var viewer;
    viewer = new PopcornViewer(opt);
    return viewer;
  }

  static prepareButtons(hudButtons) {
    let hud = hudButtons.find(val => { return val.name == "token"; })

    if (hud) {
      hud.tools.push({
        name: "PopcornInitiative",
        title: "Pop-out popcorn initiative tracker",
        icon: "fas fa-bolt",
        onClick: () => {
          let opt = Dialog.defaultOptions;
          opt.resizable = true;
          opt.title = "Popcorn Initiative Tracker";
          opt.width = 400;
          opt.height = 500;
          opt.minimizable = true;

          let viewer = PopcornViewer.getDefaultViewer();
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
    if (game.combat) {
      if (!game.combat.combatants.find(c => c.name == "Placeholder")) {
        const toCreate = [];
        toCreate.push({ actorId: this.id, hidden: true, name: "Placeholder" });
        game.combat.createEmbeddedDocuments("Combatant", toCreate);
        game.combat.update();
      }
      let contents = `<h1>Round ${game.combat.round}</h1>`;
      contents += this.prepareNominee();
      if (game.combat.current.turn > 0) {
        contents += this.prepareCurrentTurn();
      }
      if(!game.user.isGM)
        contents += this.preparePlayerCharacter();
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
        <td width="70"><img src="${nominee.token.actor.img}" width="50" height="50"></img></td>  
        <td>${nominee.token.name}</td>  
        <td>${nominee.getFlag('world', 'availableInterruptPoints')} / ${nominee.getFlag('world', 'interruptPoints')}  
      </tr>  
      </table>`;
    }
    else { return ``; }

  }
  prepareCurrentTurn() {
    let currentCombatant = game.combat.combatants.get(game.combat.current.combatantId);
    return `<h2>Current Turn</h2>  
      <table border="1" cellspacing="0" cellpadding="2">  
      <tr>  
        <td style="background: black; color: white;"/>  
        <td style="background: black; color: white;">Character</td>  
        <td style="background: black; color: white;">Init. Points</td>  
      </tr>  
      <tr>  
        <td width="70">
          <img 
            src="${currentCombatant.token.actor.img}" 
            width="40" 
            height="40"
            style="border: 0px"/>
        </td>
        <td>${currentCombatant.token.name}</td>  
        <td>${currentCombatant.getFlag('world', 'availableInterruptPoints')} / ${currentCombatant.getFlag('world', 'interruptPoints')}  
      </tr>`;
  }

  preparePlayerCharacter() {
    var combatants = game.combat.combatants.filter(
      (c => c.isOwner && game.combat.current.combatantId != c.id)
        || game.user.isGM
    );
    if (combatants.length > 0)
      return this.prepareCombatantContents(combatants, 'My Character', false);
    else return '';
  }

  prepareRemainingCombatants() {
    var combatants = game.combat.combatants.filter(c => !c.isOwner || game.user.isGM);
    return this.prepareCombatantContents(combatants, 'Remaining Combatants', true);
  }

  prepareCombatantContents(combatants, title, hide_if_gone) {
    var viewer = viewer;

    //Create a header row  
    let rows =
      [`<h2>${title}</h2>  
      <tr>  
          <td style="background: black; color: white;"/>  
          <td style="background: black; color: white;">Character</td>  
          <td style="background: black; color: white;">Init. Points</td>  
          <td style="background: black; color: white;">${this.interruptCycleInProgress ? "Interrupt?" : "Nominate?"}</td>  
      </tr>`];

    let currentCombatant = game.combat.combatants.get(game.combat.current.combatantId);
    let canNominate = game.user.isGM;
    let userCombatant;
    if (!game.user.isGM && game.user.character) {
      userCombatant = game.combat.combatants.find(c => c.actor && c.actor.id == game.user.character.id);
      canNominate = userCombatant && currentCombatant.actor && currentCombatant.actor.id == userCombatant.actor.id;
    }

    combatants.filter(c => !c.getFlag('world', 'nominatedTime'))
      .forEach(c => this.prepareCombatant(c, rows, canNominate, userCombatant));

    let myContents = `<table border="1" cellspacing="0" cellpadding="2">`;
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

  prepareCombatant(combatant, rows, canNominate, userCombatant) {
    let foundToken = combatant.token;
    if (!foundToken) { return; }
    if ((combatant.hidden || foundToken.data.hidden) && !game.user.isGM) {
      return;
    }

    let hasTakenDamage = combatant?.actor.getFlag('world', 'hasTakenDamage')
    let canInterrupt = game.user.isGM || 
      (userCombatant && 
        (userCombatant.actor.id == combatant.actor.id || hasTakenDamage));
    let isInterrupting = combatant.getFlag('world', 'attemptingInterrupt') ? true : false;
    let isCurrentCombatant = combatant.id == game.combat.current.combatantId;
    let canAct = canNominate || (this.interruptCycleInProgress && canInterrupt);
    let disabledString = !canAct || isInterrupting ? "disabled" : "";
    var buttonText;
    if (this.interruptCycleInProgress) {
      if (isInterrupting) buttonText = "Pending"; 
      else if (hasTakenDamage) buttonText = "Damaged!";
      else buttonText = "Interrupt";
    } 
    else if (hasTakenDamage) buttonText = "Damaged!";
    else {
      buttonText = "Nominate"
    }

    let defaultColor = "f8f7ea"
    let damagedColor = "ad443d"

    if (
      (combatant.initiative == 0 && !isCurrentCombatant) || game.combat.current.turn == 0) {
      let addString = ` 
        <tr> 
          <td width="70">
          <img 
            src="${foundToken.actor.img}" 
            width="40" 
            height="40"
            style="border: 0px"/>
          </td> 
          <td>${foundToken.name}</td> 
          <td>${combatant.getFlag('world', 'availableInterruptPoints')} / ${combatant.getFlag('world', 'interruptPoints')} 
          <td> 
            <button type="button" id="${foundToken.id}"  
              name="${this.interruptCycleInProgress ? "interrupt" : "nominate"}"  
              onclick='' ${disabledString}
              style="background-color:${hasTakenDamage ? damagedColor: defaultColor}">
                ${buttonText}               
            </button> 
        </td> 
      </tr>`;

      rows.push(addString);
    }
  }

  static async onCreateCombatant(combatant) {
    if (!game.user.isGM) return
    if (combatant.name == "Placeholder") {
      await game.combat.setInitiative(combatant.id, 999);
    } else {
      await this.initInterruptPoints(combatant);
      await game.combat.setInitiative(combatant.id, 0);
    }
  }

  static hasAlert(actor){
    return actor.items.filter(i => i.type == "feat" && ["Alert", "Temporal Awareness"].includes(i.name)).length > 0;
  }

  static async initInterruptPoints(combatant) {
    let actor = combatant.token.actor;
    let hasAlert = PopcornViewer.hasAlert(actor);

    await combatant.setFlag('world', 'interruptPoints',
      Math.max(actor.data.data.abilities.dex.mod + (hasAlert ? 5 : 0), 1));

    await combatant.setFlag('world', 'availableInterruptPoints',
      Math.max(combatant.token.actor.data.data.abilities.dex.mod + (hasAlert ? 5 : 0), 1));
  }

  static async onPreUpdateActor(changed, options, userId) {
    // Determine the next turn number
    let new_hp = options.data?.attributes.hp.value;
    let prev_hp = changed.data.data.attributes.hp.value;
    if (new_hp < prev_hp){
      await changed.setFlag('world', 'hasTakenDamage', true);
    }
  }
}

export { PopcornViewer };

Hooks.on('ready', function () {
  game.system.popcorn = PopcornViewer.getDefaultViewer();
})

Hooks.on('getSceneControlButtons', function (hudButtons) {
  PopcornViewer.prepareButtons(hudButtons);
})

Hooks.on('createCombatant', function (combatant) { PopcornViewer.onCreateCombatant(combatant).then() });
Hooks.on('updateCombatant', function (combatant) { game.system.popcorn.onUpdateCombatant(combatant) });
Hooks.on('preUpdateActor', function (changed, options, userId) { PopcornViewer.onPreUpdateActor(changed, options, userId).then() });

Hooks.on('renderCombatTracker', () => {
  if (game.system.popcorn != undefined) setTimeout(function () { game.system.popcorn.render(false); });
})
Hooks.on('updateToken', (scene, token, data) => {
  if (data.hidden != undefined) {
    if (game.system.popcorn != undefined) setTimeout(function () { game.system.popcorn.render(false); });
  }
})