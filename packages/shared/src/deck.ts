import { Card } from "./types.js";

export const UltimateDeck: Card[] = [
  // FORFEITS
  { id: "f1", deck: "ultimate", type: "forfeit", title: "Drink", body: "Take 1 drink.", resolution: { kind: "none" } },
  { id: "f3", deck: "ultimate", type: "forfeit", title: "Give 2", body: "Give 2 drinks to another player.", resolution: { kind: "chooseTarget", min: 1, max: 1 } },
  // ==========================
// SOCIABLES – ULTIMATE FORFEITS
// ==========================

	{ id: "f101", deck: "ultimate", type: "forfeit", title: "All Black", body: "Drink if you are wearing black.", resolution: { kind: "none" } },
	{ id: "f102", deck: "ultimate", type: "forfeit", title: "Tall Order", body: "Drink if you are 6ft (183cm) or taller.", resolution: { kind: "none" } },
	{ id: "f103", deck: "ultimate", type: "forfeit", title: "Short King / Queen", body: "Drink if you are under 5ft 6in (167cm).", resolution: { kind: "none" } },
	{ id: "f104", deck: "ultimate", type: "forfeit", title: "Men Drink", body: "All men take 1 drink.", resolution: { kind: "none" } },
	{ id: "f105", deck: "ultimate", type: "forfeit", title: "Women Drink", body: "All women take 1 drink.", resolution: { kind: "none" } },

	{ id: "f106", deck: "ultimate", type: "forfeit", title: "Sibling Rivalry", body: "Take 1 drink for every sibling you have.", resolution: { kind: "none" } },
	{ id: "f107", deck: "ultimate", type: "forfeit", title: "Only Child", body: "Drink if you are an only child.", resolution: { kind: "none" } },
	{ id: "f108", deck: "ultimate", type: "forfeit", title: "Pet Owner", body: "Drink if you own a pet.", resolution: { kind: "none" } },
	{ id: "f109", deck: "ultimate", type: "forfeit", title: "Cat Person", body: "Drink if you have a cat.", resolution: { kind: "none" } },
	{ id: "f110", deck: "ultimate", type: "forfeit", title: "Dog Person", body: "Drink if you have a dog.", resolution: { kind: "none" } },

	{ id: "f111", deck: "ultimate", type: "forfeit", title: "Glasses Gang", body: "Drink if you are wearing glasses or contacts.", resolution: { kind: "none" } },
	{ id: "f112", deck: "ultimate", type: "forfeit", title: "Tattooed", body: "Drink if you have at least one tattoo.", resolution: { kind: "none" } },
	{ id: "f113", deck: "ultimate", type: "forfeit", title: "Pierced", body: "Drink if you have a piercing.", resolution: { kind: "none" } },
	{ id: "f114", deck: "ultimate", type: "forfeit", title: "Natural Hair", body: "Drink if your hair is your natural color.", resolution: { kind: "none" } },
	{ id: "f115", deck: "ultimate", type: "forfeit", title: "Dyed Hair", body: "Drink if your hair is dyed.", resolution: { kind: "none" } },

	{ id: "f116", deck: "ultimate", type: "forfeit", title: "Relationship Status", body: "Drink if you are currently in a relationship.", resolution: { kind: "none" } },
	{ id: "f117", deck: "ultimate", type: "forfeit", title: "Single Life", body: "Drink if you are single.", resolution: { kind: "none" } },
	{ id: "f118", deck: "ultimate", type: "forfeit", title: "Ex Files", body: "Drink if you are still friends with an ex.", resolution: { kind: "none" } },

	{ id: "f119", deck: "ultimate", type: "forfeit", title: "Driver", body: "Drink if you have a driver’s license.", resolution: { kind: "none" } },
	{ id: "f120", deck: "ultimate", type: "forfeit", title: "Car Owner", body: "Drink if you own a car.", resolution: { kind: "none" } },
	{ id: "f121", deck: "ultimate", type: "forfeit", title: "Public Transport", body: "Drink if you use public transport regularly.", resolution: { kind: "none" } },

	{ id: "f122", deck: "ultimate", type: "forfeit", title: "Late Night", body: "Drink if you stayed up past 2am last night.", resolution: { kind: "none" } },
	{ id: "f123", deck: "ultimate", type: "forfeit", title: "Early Bird", body: "Drink if you woke up before 8am today.", resolution: { kind: "none" } },
	{ id: "f124", deck: "ultimate", type: "forfeit", title: "Coffee Drinker", body: "Drink if you drink coffee daily.", resolution: { kind: "none" } },
	{ id: "f125", deck: "ultimate", type: "forfeit", title: "Energy Drink", body: "Drink if you’ve had an energy drink this week.", resolution: { kind: "none" } },

	{ id: "f126", deck: "ultimate", type: "forfeit", title: "Gym Member", body: "Drink if you have a gym membership.", resolution: { kind: "none" } },
	{ id: "f127", deck: "ultimate", type: "forfeit", title: "Never Gym", body: "Drink if you don’t work out at all.", resolution: { kind: "none" } },

	{ id: "f128", deck: "ultimate", type: "forfeit", title: "Social Media", body: "Drink if you use social media every day.", resolution: { kind: "none" } },
	{ id: "f129", deck: "ultimate", type: "forfeit", title: "TikTok Brain", body: "Drink if TikTok is installed on your phone.", resolution: { kind: "none" } },
	{ id: "f130", deck: "ultimate", type: "forfeit", title: "Instagrammer", body: "Drink if you posted on Instagram this week.", resolution: { kind: "none" } },

	{ id: "f131", deck: "ultimate", type: "forfeit", title: "Traveler", body: "Drink if you’ve been to another country.", resolution: { kind: "none" } },
	{ id: "f132", deck: "ultimate", type: "forfeit", title: "Frequent Flyer", body: "Drink if you’ve been on a plane in the last year.", resolution: { kind: "none" } },

	{ id: "f133", deck: "ultimate", type: "forfeit", title: "Smoker", body: "Drink if you smoke or vape.", resolution: { kind: "none" } },
	{ id: "f134", deck: "ultimate", type: "forfeit", title: "Non-Smoker", body: "Drink if you don’t smoke or vape.", resolution: { kind: "none" } },

	{ id: "f135", deck: "ultimate", type: "forfeit", title: "Birthday Month", body: "Drink if your birthday is this month.", resolution: { kind: "none" } },
	{ id: "f136", deck: "ultimate", type: "forfeit", title: "Winter Baby", body: "Drink if you were born in winter.", resolution: { kind: "none" } },
	{ id: "f137", deck: "ultimate", type: "forfeit", title: "Summer Baby", body: "Drink if you were born in summer.", resolution: { kind: "none" } },

	{ id: "f138", deck: "ultimate", type: "forfeit", title: "Left Handed", body: "Drink if you are left-handed.", resolution: { kind: "none" } },
	{ id: "f139", deck: "ultimate", type: "forfeit", title: "Right Handed", body: "Drink if you are right-handed.", resolution: { kind: "none" } },

	{ id: "f140", deck: "ultimate", type: "forfeit", title: "Been Hungover", body: "Drink if you’ve ever been hungover.", resolution: { kind: "none" } },
	{ id: "f141", deck: "ultimate", type: "forfeit", title: "Regret Shot", body: "Drink if you’ve ever regretted a shot.", resolution: { kind: "none" } },
	{ id: "f142", deck: "ultimate", type: "forfeit", title: "Party Animal", body: "Drink if you go out drinking at least once a week.", resolution: { kind: "none" } },

	{ id: "f143", deck: "ultimate", type: "forfeit", title: "First Name Basis", body: "Drink if you know everyone’s first name here.", resolution: { kind: "none" } },
	{ id: "f144", deck: "ultimate", type: "forfeit", title: "Strangers", body: "Drink if there’s someone here you just met tonight.", resolution: { kind: "none" } },

	{ id: "f145", deck: "ultimate", type: "forfeit", title: "Phone Battery", body: "Drink if your phone battery is under 20%.", resolution: { kind: "none" } },
	{ id: "f146", deck: "ultimate", type: "forfeit", title: "Cracked Screen", body: "Drink if your phone screen is cracked.", resolution: { kind: "none" } },

	{ id: "f147", deck: "ultimate", type: "forfeit", title: "Work Tomorrow", body: "Drink if you have work tomorrow.", resolution: { kind: "none" } },
	{ id: "f148", deck: "ultimate", type: "forfeit", title: "Day Off", body: "Drink if you don’t have work tomorrow.", resolution: { kind: "none" } },

	{ id: "f149", deck: "ultimate", type: "forfeit", title: "Game Night", body: "Drink if this is not your first drinking game tonight.", resolution: { kind: "none" } },
	{ id: "f150", deck: "ultimate", type: "forfeit", title: "First Timer", body: "Drink if this is your first time playing Sociables.", resolution: { kind: "none" } },

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
