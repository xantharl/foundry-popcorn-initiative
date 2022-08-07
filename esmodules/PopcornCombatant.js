class PopcornCombatant extends Combatant {
    /**
     * Advance the combat to the next turn
     * @return {Promise<Combatant>}
     */
  
    constructor(combatant){
      super(combatant);
    }
  
     async _onUpdate(changed, options, userId) {
      // Determine the next turn number
      let has_taken_damage = false
      return super.update({has_taken_damage: has_taken_damage},options, userId);
    }
  }
  
  export {PopcornCombatant};