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
    const token = canvas.tokens.get(tokenId);

    await token.setFlag("world", "popcornHasActed", true);
    await ChatMessage.create({
      content: `${token.name} is acting now.`,
      speaker:
      {
        alias: "Game: "
      }
    });
    game.socket.emit("module.Popcorn", { "HasActed": true });
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

  preparePopcorn() {
    //console.log("PreparePopcorn called");
    //Get a list of the active combatants
    if (game.combat != null) {
      var combatants = game.combat.combatants;
      var viewer = viewer;

      let table = `<h1>Round ${game.combat.round}</h1><table border="1" cellspacing="0" cellpadding="4">`;

      //Create a header row
      let rows = 
        [`<tr>
            <td style="background: black; color: white;"/>
            <td style="background: black; color: white;">Character</td>
            <td style="background: black; color: white;">Init. Points</td>`];
      if (game.user.isGM) {
        rows[0] += [`<td style="background: black; color: white;">Nominate?</td>`];
      }
      rows[0]+=`</tr>`
      
      combatants.forEach(element => this.prepareCombatant(element, rows));

      let myContents = `${table}`;
      rows.forEach(element => myContents += element)
      myContents += "</table>"
      if (game.user.isGM) {
        myContents += `<button type ="button" onclick='
            let actors = canvas.tokens.placeables;
            actors.forEach(actor =>{actor.setFlag("world","popcornHasActed",false)});
            game.combat.nextRound();
            ChatMessage.create({content: "Starting a new Round.", speaker : { alias : "Game: "}})
            '>Next Round</button><p>`
        myContents += `<button type ="button" onclick='
            let actors = canvas.tokens.placeables;
            actors.forEach(actor =>{actor.setFlag("world","popcornHasActed",false)});
            game.combat.endCombat();
            ChatMessage.create({content: "Ending the Encounter.", speaker : { alias : "Game: "}})
            '>End the Encounter</button>`
      }
      return myContents;
    } else { return "<h1>No Conflicts Detected!</h1>" }
  }

  // This function prepares the contents of the popcorn initiative viewer
  // Display the current Round number
  // Display the actor icon of each combatant for which popcornHasActed is false or undefined.
  // Display the name of each combatant for which popcornHasActed is false or undefined.
  // Display a button that says 'Nominate'
  // At the end of the display of buttons etc. display a button that says 'next Round'.

  prepareCombatant(combatant, rows) {
    var tokenId;
    var tokens = canvas.tokens.placeables;

    if (typeof (combatant.token) != "undefined") {
      tokenId = combatant.token._id;//This is the representative of a token in the combatants list.
    }
    //Now to find the token in the placeables layer that corresponds to this token.

    let foundToken = undefined;

    if (tokenId != undefined) {
      foundToken = tokens.find(val => { return val.id == tokenId; })
    }
    if ((combatant.hidden || foundToken.data.hidden) && !game.user.isGM) {
      return;
    }

    let hasActed = true;

    if (foundToken != undefined) {
      //There is no token for this actor in the conflict; it probably means the token has been deleted from the scene. We need to ignore this actor. Easiest way to do that is to leave hasActed as true.
      hasActed = foundToken.getFlag("world", "popcornHasActed");
    }

    if (game.user.isGM) {
      if (hasActed == undefined || hasActed == false) {
        rows.push(`<tr><td width="70"><img src="${foundToken.actor.img}" width="50" height="50"></img>
        </td><td>${foundToken.name}</td>
        <td><button type="button" id="${tokenId}" name="nominate" onclick=''>Nominate</button></td></tr>`);
      }
    } else {
      if (hasActed == undefined || hasActed == false) {
        rows.push(`<tr><td width="70"><img src="${foundToken.actor.img}" width="50" height="50"></img></td><td>${foundToken.name}</td>`)
      }
    }
  }

  static onCreateCombatant(combatant) {
    this.initInterruptPoints(combatant);
  }

  static initInterruptPoints(combatant){
    combatant.data.flags.interruptPoints = 
      Math.max(Math.floor(combatant._token._actor.data.data.abilities.dex.mod),1);
  }
}

Hooks.on('createCombatant', function(combatant) { PopcornViewer.onCreateCombatant(combatant) });

Hooks.on('getSceneControlButtons', function (hudButtons) {
  PopcornViewer.prepareButtons(hudButtons);
})

Hooks.on('renderCombatTracker', () => {
  if (game.system.popcorn != undefined) setTimeout(function () { game.system.popcorn.render(false); }, 50);
})
Hooks.on('updateToken', (scene, token, data) => {
  if (data.hidden != undefined) {
    if (game.system.popcorn != undefined) setTimeout(function () { game.system.popcorn.render(false); }, 50);
  }
})