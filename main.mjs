import { Plugin as e } from "obsidian";
class o extends e {
  async onload() {
    console.log("InterBrain plugin loaded!"), this.addRibbonIcon("brain-circuit", "Open DreamSpace", () => {
      console.log("DreamSpace clicked!");
    }), this.addCommand({
      id: "open-dreamspace",
      name: "Open DreamSpace",
      callback: () => {
        console.log("Open DreamSpace command executed");
      }
    });
  }
  onunload() {
    console.log("InterBrain plugin unloaded");
  }
}
export {
  o as default
};
