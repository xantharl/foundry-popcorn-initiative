import {PopcornCombat} from "./PopcornCombat.js";

class PopcornViewer extends Application {
  super(options) {
    //console.log("Super called");
  }

  activateListeners(html) {
    super.activateListeners(html);
    const myButton = html.find("button[name='nominate']");
    myButton.on("click", event => this._onClickButton(event, html));
  }

  async _onClickButton(event, html) {
    //console.log("Event target id "+event.target.id);

    const tokenId = event.target.id;
    let combatant = game.combat.combatants.find(c => c.token.id == tokenId);
    let currentInit =
      game.combat.current.turn == 0 ? 999
        : game.combat.combatants.find(c => c.id == game.combat.current.combatantId).initiative;

    await game.combat.setInitiative(combatant.id, currentInit - 1);
    await combatant.update();
    await game.combat.prepareDerivedData();
    await game.combat.update();

    if (game.combat.combatants.find(c => c.initiative == 0) != null) {
      // builtin combat.nextTurn assumes a pre-sorted turn order, so let's give it one
      game.combat.turns.sort(function(a,b) { return (a.initiative>b.initiative) ? 1 : ((b.initiative > a.initiative) ? -1 : 0);} );
      let pc = new PopcornCombat.PopcornCombat(game.combat);
      await pc.nextTurn();
    }

    await ChatMessage.create({
      content: `${combatant.token.name} is acting now.`,
      speaker:
      {
        alias: "Game: "
      }
    });
    await game.socket.emit("module.Popcorn", { "hasActed": true });
    this.render(false);
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
    return content;
  }

  prepareCurrentTurn() {
    let combatant = game.combat.combatants.get(game.combat.current.combatantId);
    let contents = `<h2>Current Turn</h2>
      <table border="1" cellspacing="0" cellpadding="4">`;

    contents += `<tr>
        <td style="background: black; color: white;"/>
        <td style="background: black; color: white;">Character</td>
        <td style="background: black; color: white;">Init. Points</td>
      </tr>
      <tr>
        <td width="70"><img src="${combatant._token.actor.img}" width="50" height="50"></img></td>
        <td>${combatant._token.name}</td>
        <td>${combatant.getFlag('world', 'availableInterruptPoints')} / ${combatant.getFlag('world', 'interruptPoints')}
      </tr>`;    

    return contents;
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
          <td style="background: black; color: white;">Init. Points</td>`];
    if (game.user.isGM) {
      rows[0] += [`<td style="background: black; color: white;">Nominate?</td>`];
    }
    rows[0] += `</tr>`

    combatants.forEach(c => this.prepareCombatant(c, rows));

    let myContents = `<table border="1" cellspacing="0" cellpadding="4">`;
    rows.forEach(element => myContents += element)
    myContents += "</table>"
    if (game.user.isGM) {
      myContents += `<button type ="button" onclick='
          let combatants = game.combat.combatants;
          game.combat.combatants.forEach(c => game.combat.setInitiative(c.id,0));
          game.combat.nextRound();
          ChatMessage.create({content: "Starting a new Round.", speaker : { alias : "Game: "}})
          '>Next Round</button><p>`
      myContents += `<button type ="button" onclick='
          let combatants = game.combat.combatants;            
          game.combat.combatants.forEach(c => game.combat.setInitiative(c.id,0));
          game.combat.endCombat();
          ChatMessage.create({content: "Ending the Encounter.", speaker : { alias : "Game: "}})
          '>End the Encounter</button>`
    }
    return myContents;
  }
  
  preparePopcorn() {
    //console.log("PreparePopcorn called");
    //Get a list of the active combatants
    if (game.combat.turn != null) {
      let contents = `<h1>Round ${game.combat.round}</h1>`;
      if (game.combat.current.turn > 0)
        contents += this.prepareCurrentTurn();
      contents += this.prepareRemainingCombatants();
      return contents;
    } else { return "<h1>No Conflicts Detected!</h1>" }
  }

  // This function prepares the contents of the popcorn initiative viewer
  // Display the current Round number
  // Display the actor icon of each combatant for which hasActed is false or undefined.
  // Display the name of each combatant for which hasActed is false or undefined.
  // Display a button that says 'Nominate'
  // At the end of the display of buttons etc. display a button that says 'next Round'.

  prepareCombatant(combatant, rows) {
    let foundToken = combatant.token;

    if ((combatant.hidden || foundToken.data.hidden) && !game.user.isGM) {
      return;
    }

    let isCurrentCombatant = combatant.id == game.combat.current.combatantId;

    if (
      (combatant.initiative == 0 && !isCurrentCombatant) || game.combat.current.turn == 0) {
      let addString = `
        <tr>
          <td width="70"><img src="${foundToken.actor.img}" width="50" height="50"></img></td>
          <td>${foundToken.name}</td>
          <td>${combatant.getFlag('world', 'availableInterruptPoints')} / ${combatant.getFlag('world', 'interruptPoints')}`;

      if (game.user.isGM) { addString += `<td><button type="button" id="${foundToken.id}" name="nominate" onclick=''>Nominate</button></td>` }
      addString += '</tr>'

      rows.push(addString);
    }
  }

  static async onCreateCombatant(combatant) {
    await this.initInterruptPoints(combatant);
    await game.combat.setInitiative(combatant.id, 0);
  }

  static async initInterruptPoints(combatant) {
    await combatant.setFlag('world', 'interruptPoints',
      Math.max(combatant._token._actor.data.data.abilities.dex.mod, 1));

    await combatant.setFlag('world', 'availableInterruptPoints',
      Math.max(combatant._token._actor.data.data.abilities.dex.mod, 1));
  }
}

export {PopcornViewer};

Hooks.on('createCombatant', function (combatant) { PopcornViewer.onCreateCombatant(combatant) });

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