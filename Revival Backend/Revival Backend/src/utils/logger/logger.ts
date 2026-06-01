import chalk from "chalk";

function timestamp(): string {
  return chalk.dim(new Date().toLocaleTimeString("en-GB", { hour12: false }));
}

export default {
  backend(...messages: string[]) {
    console.log(chalk.cyan.bold(" ◆  REVIVAL "), timestamp(), ...messages);
  },

  startup(...messages: string[]) {
    console.log(chalk.green.bold(" ▶  STARTUP "), timestamp(), ...messages);
  },

  bot(...messages: string[]) {
    console.log(chalk.cyan(" ●  BOT "), timestamp(), ...messages);
  },

  debug(...messages: string[]) {
    console.log(chalk.magenta(" ◇  DEBUG "), timestamp(), ...messages);
  },

  error(...messages: string[]) {
    console.error(chalk.red.bold(" ✕  ERROR "), timestamp(), ...messages);
  },

  info(...messages: string[]) {
    if (messages.length > 0 && typeof messages[0] === "string") {
      const first = messages[0].trim();
      if (first.startsWith("[")) {
        console.log(...messages);
        return;
      }
    }
    console.log(chalk.blue(" ℹ  INFO "), timestamp(), ...messages);
  },

  success(...messages: string[]) {
    console.log(chalk.green.bold(" ✔  SUCCESS "), timestamp(), ...messages);
  },

  warning(...messages: string[]) {
    console.log(chalk.yellow(" ⚠  WARNING "), timestamp(), ...messages);
  },
};