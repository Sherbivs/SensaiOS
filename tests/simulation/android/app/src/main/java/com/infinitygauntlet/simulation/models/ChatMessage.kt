package com.infinitygauntlet.simulation.models

/**
 * Chat Message data model
 * Represents a single message in the chat UI
 */
data class ChatMessage(
    val id: String = java.util.UUID.randomUUID().toString(),
    val text: String,
    val sender: String,
    val timestamp: Long = System.currentTimeMillis(),
    val isBot: Boolean,
    val channel: String = "homestead"
) {
    fun getFormattedTime(): String {
        val dateFormat = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
        return dateFormat.format(java.util.Date(timestamp))
    }
    
    fun isCommand(): Boolean {
        return text.startsWith("/")
    }
    
    companion object {
        fun createUserMessage(text: String, channel: String = "homestead"): ChatMessage {
            return ChatMessage(
                text = text,
                sender = "You",
                isBot = false,
                channel = channel
            )
        }
        
        fun createBotMessage(text: String, channel: String = "homestead"): ChatMessage {
            return ChatMessage(
                text = text,
                sender = "Bot",
                isBot = true,
                channel = channel
            )
        }
        
        fun createSystemMessage(text: String, channel: String = "homestead"): ChatMessage {
            return ChatMessage(
                text = text,
                sender = "System",
                isBot = true,
                channel = channel
            )
        }
        
        /**
         * Simulates bot response based on command
         */
        fun simulateBotResponse(command: String, channel: String): ChatMessage {
            val response = when {
                command.startsWith("/starter") -> {
                    "🎮 **Choose Your Starter!**\n\n" +
                    "🔥 Charmander - Fire Type\n" +
                    "💧 Squirtle - Water Type\n" +
                    "🌿 Bulbasaur - Grass Type\n\n" +
                    "Reply with the name of your chosen Pokémon!"
                }
                command.startsWith("/home") -> {
                    "🏠 **Welcome Home!**\n\n" +
                    "Your Pokémon are resting comfortably.\n" +
                    "HP: ██████████ 100%\n\n" +
                    "What would you like to do?"
                }
                command.startsWith("/walk") -> {
                    "🌲 **Wild Encounter!**\n\n" +
                    "A wild **Pidgey** appeared!\n" +
                    "Level: 5 | HP: 20/20\n\n" +
                    "What will you do? [Fight] [Catch] [Run]"
                }
                command.startsWith("/heal") -> {
                    "💊 **Healing Complete!**\n\n" +
                    "Your Pokémon have been restored to full health!\n" +
                    "All status conditions have been cured.\n\n" +
                    "Ready for your next adventure!"
                }
                command.startsWith("/battle") -> {
                    "⚔️ **Battle Started!**\n\n" +
                    "Opponent: Trainer Joey\n" +
                    "His Pokémon: Rattata (Level 3)\n\n" +
                    "Your move?"
                }
                else -> {
                    "❓ Unknown command. Try:\n" +
                    "• /starter - Choose your starting Pokémon\n" +
                    "• /home - Return home\n" +
                    "• /walk - Explore the wild\n" +
                    "• /heal - Heal your Pokémon\n" +
                    "• /battle - Start a battle"
                }
            }
            
            return createBotMessage(response, channel)
        }
    }
}
