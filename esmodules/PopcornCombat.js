class PopcornCombat extends Combat {
  /**
   * Advance the combat to the next turn
   * @return {Promise<Combat>}
   */

  constructor(combat){
    super(combat);
  }

   async nextTurn() {
    // Determine the next turn number
    let next = game.combat.turns[0];

    // Update the encounter
    const advanceTime = CONFIG.time.turnTime;
    return super.update({id: this.id, turn: this.turn+1, current: next}, {advanceTime});
  }
}

export {PopcornCombat};