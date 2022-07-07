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
        interrupterHasTakenDamage = combatant.getFlag('world', 'hasTakenDamage') ?? false; 

        // TODO: Don't allow interrupt of PC by PC 
 
        if (interrupterPoints < nomineePoints && !interrupterHasTakenDamage) { 
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
 
    async resolveInterrupt() { 
        // TODO: Handle damage interrupts  
        let interrupters = this.getAttemptedInterrupters();

        if (interrupters.length == 0) 
            return this.nomineeCombatant; 
 
        let mostDisruptive = (interrupters.sort(this.sortInterrupters))[0]; 

        if (mostDisruptive.getFlag('world', 'hasTakenDamage') && !this.nomineeCombatant.getFlag('world', 'hasTakenDamage')) { 
            await ChatMessage.create({ 
                content: `${mostDisruptive.name} wins by damage interrupt.`, 
                speaker: 
                { 
                    alias: "Game: " 
                }
 
            });              
        } 
        else if (mostDisruptive.getFlag('world', 'availableInterruptPoints') > this.nomineeCombatant.getFlag('world', 'availableInterruptPoints')) { 
            await ChatMessage.create({ 
                content: `${mostDisruptive.name} wins with ${mostDisruptive.getFlag('world', 'availableInterruptPoints')} interrupt points (Nominee has ${this.nomineeCombatant.getFlag('world', 'availableInterruptPoints')}).`, 
                speaker: 
                { 
                    alias: "Game: " 
                }
 
            });              
        } 
        else { 
            let contestingDexMod = mostDisruptive._token._actor.data.data.abilities.dex.mod;
            let nomineeDexMod = this.nomineeCombatant._token._actor.data.data.abilities.dex.mod;
            if (contestingDexMod > nomineeDexMod) { 
                await ChatMessage.create({ 
                    content: `Initiative points match: ${mostDisruptive.name} wins by Dex Mod.`, 
                    speaker: 
                    { 
                        alias: "Game: " 
                    }
     
                }); 
            } 
            else if (nomineeDexMod == contestingDexMod) {                 
                let rolloff = this.resolveRolloff(mostDisruptive, this.nomineeCombatant); 
                await ChatMessage.create({ 
                    content: `Initiative points and Dex Mod match: ${rolloff.winner.name} wins by rolloff (${this.nomineeCombatant.name}: ${rolloff.nomineeRoll}, ${mostDisruptive.name}: ${rolloff.contestingRoll}).`, 
                    speaker: 
                    { 
                        alias: "Game: " 
                    }     
                }); 
                mostDisruptive = rolloff.winner;
            } 
 
            mostDisruptive = this.nomineeCombatant; 
        }             
        
        // clear the current turn's damage taken statuses so they can't damage steal
        for (combatant in game.combat.combatants) {
            if (combatant.actor.getFlag('world', 'hasTakenDamage')) {
                combatant.actor.unsetFlag('world', 'hasTakenDamage')
            }
        }

        return mostDisruptive;
    } 
    getAttemptedInterrupters(){ 
        return game.combat.combatants.filter(c => c.getFlag('world', 'attemptingInterrupt')); 
    } 
 
    sortInterrupters(a, b) { 
        aHasTakenDamage = a.getFlag('world', 'hasTakenDamage'); 
        bHasTakenDamage = b.getFlag('world', 'hasTakenDamage'); 
        if (aHasTakenDamage ^ bHasTakenDamage)
            return aHasTakenDamage > bHasTakenDamage

        aPoints = a.getFlag('world', 'availableInterruptPoints'); 
        bPoints = b.getFlag('world', 'availableInterruptPoints'); 
        return ( 
            aPoints > bPoints) ? -1 : ((bPoints > aPoints) ? 1 : 0); 
    } 
 
    static getRandomInt(max) {
        return Math.floor(Math.random() * max);
    }

    resolveRolloff(mostDisruptive, nominee) { 
        // TBD: Figure out how to have a rolloff 
        var nomineeRoll;
        var contestingRoll;
        do {
            nomineeRoll = PopcornInterruptHandler.getRandomInt(20)+1;
            contestingRoll = PopcornInterruptHandler.getRandomInt(20)+1;
        } while (nomineeRoll == contestingRoll);

        return {
            winner: nomineeRoll >= contestingRoll ? nominee : mostDisruptive,
            nomineeRoll: nomineeRoll,
            contestingRoll: contestingRoll
        }; 
    } 
 
    async clearFlags() { 
        for (let c of game.combat.combatants) { 
            await c.unsetFlag('world', 'attemptingInterrupt'); 
            await c.update(); 
        } 
    } 
} 
 
export { PopcornInterruptHandler };