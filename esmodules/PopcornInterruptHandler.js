class PopcornInterruptHandler extends Application {
    super(options) {}

    constructor(nomineeCombatant) {
        super();
        this.nomineeCombatant = nomineeCombatant;
    }

    async registerInterrupt(combatant){
        var interrupterPoints;
        var nomineePoints;

        interrupterPoints = combatant.getFlag('world', 'availableInterruptPoints');
        nomineePoints = nomineeCombatant.getFlag('world', 'availableInterruptPoints');
        if (interrupterPoints < nomineePoints){
            await ChatMessage.create({
                content: `${combatant.token.name} does not have enough points to interrupt.`,
                speaker:
                {
                  alias: "Game: "
                }
              });
        }

        await combatant.setFlag('world', 'attemptingInterrupt', true);        
    }

    resolveInterrupt(){
        // TODO: Handle damage interrupts

        let interrupters = game.combat.combatants.filter(c => c.getFlag('world', 'attemptingInterrupt'));
        if (interrupters.length == 0)
            return this.nomineeCombatant;

        let mostDisruptive = (interrupters.sort(this.sortInterrupters))[0];

        if (mostDisruptive.getFlag('world', 'availableInterruptPoints') > this.nomineeCombatant.getFlag('world', 'availableInterruptPoints')){
            return mostDisruptive;
        }
        else {
            
            if (mostDisruptive._token._actor.data.data.abilities.dex.mod > this.nomineeCombatant._token._actor.data.data.abilities.dex.mod){
                return mostDisruptive;
            }
            else if (mostDisruptive._token._actor.data.data.abilities.dex.mod == this.nomineeCombatant._token._actor.data.data.abilities.dex.mod){
                return resolveRolloff(mostDisruptive, this.nomineeCombatant);
            }
            
            return this.nomineeCombatant;
        }
    }

    sortInterrupters(a, b){
        aPoints = a.getFlag('world', 'availableInterruptPoints');
        bPoints = b.getFlag('world', 'availableInterruptPoints');
        return (
            aPoints > bPoints) ? -1 : ((bPoints > aPoints) ? 1 : 0);
    }

    resolveRolloff(mostDisruptive, nominee) {
        // TBD: Figure out how to have a rolloff
        return nominee;
    }

    async clearFlags() { 
        for (let c of game.combat.combatants) { 
            await c.unsetFlag('world', 'attemptingInterrupt'); 
            await c.update(); 
        } 
    } 
}

export { PopcornInterruptHandler };