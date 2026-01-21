export function computeTimer(card) {
    if (card.resolution.kind === "createRuleText") {
        return { enabled: false, seconds: 0, reason: "Custom rule entry" };
    }
    let seconds = 30;
    if (["rule", "role", "curse", "joker"].includes(card.type))
        seconds = 45;
    if (card.type === "event")
        seconds = 60;
    switch (card.resolution.kind) {
        case "chooseTarget":
            seconds += 10;
            break;
        case "rockPaperScissors":
            seconds += 10;
            break;
        case "chooseNumber":
            seconds += 10;
            break;
        case "chooseTargetAndNumber":
            seconds += 20;
            break;
        case "chooseTwoTargets":
            seconds += 25;
            break;
    }
    seconds = Math.max(20, Math.min(90, seconds));
    return { enabled: true, seconds };
}
