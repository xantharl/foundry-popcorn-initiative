class PopcornInterruptHandler extends Application { 
    super(options) { } 
 
    constructor(nomineeCombatant) { 
        super(); 
        this.nomineeCombatant = nomineeCombatant; 
    } 
 
    async registerInterrupt(combatant) { 
        var interrupterPoints; 
        var nomineePoints; 
 
        interrupterPoints = combatant.getFlag('world', 'availableInterruptPoints'); 
        nomineePoints = this.nomineeCombatant.getFlag('world', 'availableInterruptPoints'); 
 
        // TODO: Don't allow interrupt of PC by PC 
 
        if (interrupterPoints < nomineePoints) { 
            await ChatMessage.create({ 
                content: `${combatant.token.name} does not have enough points to interrupt.`, 
                speaker: 
                { 
                    alias: "Game: " 
                }, 
                whisper: [game.user.id] 
 
            }); 
        } 
 
        await combatant.setFlag('world', 'attemptingInterrupt', true); 
        await combatant.update(); 
    } 
 
    resolveInterrupt() { 
        // TODO: Handle damage interrupts 
 
        let interrupters = this.getAttemptedInterrupters(); 
        
        if (interrupters.length == 0) 
            return this.nomineeCombatant; 
 
        let mostDisruptive = (interrupters.sort(this.sortInterrupters))[0]; 
 
        if (mostDisruptive.getFlag('world', 'availableInterruptPoints') > this.nomineeCombatant.getFlag('world', 'availableInterruptPoints')) { 
            return mostDisruptive; 
        } 
        else { 
 
            if (mostDisruptive._token._actor.data.data.abilities.dex.mod > this.nomineeCombatant._token._actor.data.data.abilities.dex.mod) { 
                return mostDisruptive; 
            } 
            else if (mostDisruptive._token._actor.data.data.abilities.dex.mod == this.nomineeCombatant._token._actor.data.data.abilities.dex.mod) { 
                return this.resolveRolloff(mostDisruptive, this.nomineeCombatant); 
            } 
 
            return this.nomineeCombatant; 
        } 
    } 
    getAttemptedInterrupters(){ 
        return game.combat.combatants.filter(c => c.getFlag('world', 'attemptingInterrupt')); 
    } 
 
    sortInterrupters(a, b) { 
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