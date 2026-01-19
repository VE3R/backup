import { Card } from "./types.js";

export const UltimateDeck: Card[] = [
  // FORFEITS
  { id: "f1", deck: "ultimate", type: "forfeit", title: "Drink", body: "Take 1 drink.", resolution: { kind: "none" } },
  { id: "f3", deck: "ultimate", type: "forfeit", title: "Give 2", body: "Give 2 drinks to another player.", resolution: { kind: "chooseTarget", min: 1, max: 1 } },

  // RULES
  { id: "r1", deck: "ultimate", type: "rule", title: "Make a Rule", body: "Create a new rule. Anyone who breaks it drinks.", resolution: { kind: "createRuleText", maxLen: 80 } },
  { id: "r2", deck: "ultimate", type: "rule", title: "End All Rules", body: "All rules are cleared.", resolution: { kind: "none" } },

  // ROLES
  { id: "ro1", deck: "ultimate", type: "role", title: "Thumb Master", body: "When you place your thumb down, last person drinks.", resolution: { kind: "chooseTarget", min: 1, max: 1 } },
  { id: "ro2", deck: "ultimate", type: "role", title: "Question Master", body: "Anyone who answers your questions drinks.", resolution: { kind: "chooseTarget", min: 1, max: 1 } },

  // CURSES
  { id: "c1", deck: "ultimate", type: "curse", title: "Left Hand Curse", body: "You must drink with your left hand.", resolution: { kind: "chooseTarget", min: 1, max: 1 } },
  { id: "c2", deck: "ultimate", type: "curse", title: "No Names", body: "You may not say anyone’s name.", resolution: { kind: "chooseTarget", min: 1, max: 1 } },

  // EVENTS
  { id: "e1", deck: "ultimate", type: "event", title: "Socials", body: "Everyone drinks.", resolution: { kind: "none" } },
  { id: "e2", deck: "ultimate", type: "event", title: "Reverse", body: "Turn order reverses.", resolution: { kind: "none" } },

  // COUNTERPLAY / JOKERS
  { id: "j1", deck: "ultimate", type: "joker", title: "Cleanse Curse", body: "Remove a curse from a player.", resolution: { kind: "chooseTarget", min: 1, max: 1 } },
  { id: "j2", deck: "ultimate", type: "joker", title: "Transfer Curse", body: "Move a curse from one player to another.", resolution: { kind: "chooseTwoTargets", min: 2, max: 2 } },
  { id: "j3", deck: "ultimate", type: "joker", title: "Reset Roles", body: "All roles are removed.", resolution: { kind: "none" } }
];
