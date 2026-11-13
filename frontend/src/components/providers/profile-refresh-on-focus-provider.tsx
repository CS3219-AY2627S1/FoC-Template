"use client"

import { useEffect } from "react"
import { useAuth } from "@/components/providers/auth-provider"

export function ProfileRefreshOnFocusProvider() {
    const { user, refreshProfile } = useAuth()

    useEffect(() => {
        if (!user) return

        // Avoid firing duplicate refreshes for the same return to the app. 
        let refreshInProgress = false

        const refresh = async () => { 
            if (refreshInProgress) 
                return refreshInProgress = true 
            try { 
                await refreshProfile() 
            } catch (error) { 
                console.error("Failed to refresh profile:", error) 
            } finally { 
                refreshInProgress = false 
            } 
        }

        // Refresh when user refocuses on the browser
        const handleFocus = () => {
            void refresh()
        }

        // Refresh when user changes visibility to the browser
        const handleVisibilityChange = () => { 
            if (document.visibilityState === "visible") { 
                void refresh() 
            } 
        }

        window.addEventListener("focus", handleFocus)
        document.addEventListener("visibilitychange", handleVisibilityChange)

        return () => {
            window.removeEventListener("focus", handleFocus)
            document.removeEventListener("visibilitychange", handleVisibilityChange)
        }
    }, [user, refreshProfile])

    return null
}