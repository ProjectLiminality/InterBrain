// Type declarations for Obsidian API extensions
import 'obsidian'

declare module 'obsidian' {
  interface App {
    commands: {
      executeCommandById(commandId: string): boolean
    }
  }
}