"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef } from "react"
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth"

import { useConfig } from "@/components/providers/config-provider"
import { getFirebaseAuth } from "@/lib/firebase"
import { loadUserProfile, type UserProfile } from "@/lib/user-profile"

type AuthContextValue = {
  user: User | null
  loading: boolean
  profile: UserProfile | null
  profileLoading: boolean
  profileError: string | null
  refreshProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, username: string) => Promise<void>
  resendVerificationEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>
  sendFirebasePasswordResetEmail: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const config = useConfig()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Prevent repeated profile loads on ordinary token refreshes.
  const profileUidRef = useRef<string | null>(null)

  // Request counter to make sure requests are for the correct profile
  const profileRequestIdRef = useRef(0)

  // Refreshes user profile information when needed
  const refreshProfile = useCallback(async () => {
    const auth = getFirebaseAuth(config)
    const currentUser = auth.currentUser
    const requestId = ++profileRequestIdRef.current

    if (!currentUser || !currentUser.emailVerified) {
      setProfile(null)
      setProfileLoading(false)
      setProfileError(null)
      return
    }

    setProfileLoading(true)
    setProfileError(null)

    try {
      const data = await loadUserProfile(
        currentUser,
        config.apiBaseUrl
      )

      // Don't apply a stale result after switching accounts.
      if (requestId === profileRequestIdRef.current &&
          auth.currentUser?.uid === currentUser.uid) {
        setProfile(data)
      }
    } catch (error) {
      console.error("Failed to load user profile:", error)

      if (requestId === profileRequestIdRef.current &&
          auth.currentUser?.uid === currentUser.uid) {
        setProfile(null)
      }

      setProfileError(
          error instanceof Error
              ? error.message
              : "Failed to load profile."
      )
    } finally {
      // Prevent another user on the same browser from setting loading false
      // while current user is loading profile
      if (requestId === profileRequestIdRef.current) {
        setProfileLoading(false)
      }
    }
  }, [config])

  useEffect(() => {
    const auth = getFirebaseAuth(config)
    const unsubscribe = onIdTokenChanged(auth, (nextUser) => {
      if (!nextUser || !nextUser.emailVerified) {
        // Token changed, meaning profile changed
        profileRequestIdRef.current++
        profileUidRef.current = null

        setUser(null)
        setProfile(null)
        setProfileLoading(false)
        setLoading(false)
        return
      }

      setUser(nextUser)
      setLoading(false)

      // Load once when a new authenticated UID appears.
      // Token refreshes for the same user won't trigger another load.
      if (profileUidRef.current !== nextUser.uid) {
        profileRequestIdRef.current++
        profileUidRef.current = nextUser.uid

        void refreshProfile().catch(() => {
          // Error is logged and reflected in profile state.
        })
      }
    })
    
    return unsubscribe
  }, [config, refreshProfile])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const auth = getFirebaseAuth(config);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      const user = userCredential.user;

      console.log(user)

      // User is signed out if email is not verified
      if (!user.emailVerified) {
        await firebaseSignOut(auth);

        console.log(`${user.email} is not verified`)
        throw new Error("EMAIL_NOT_VERIFIED");
      }

      console.log(`${user.email} is verified`)
    },
    [config],
  )

  const signUp = useCallback(
    async (email: string, password: string, username: string) => {
        let user = null;
        const auth = getFirebaseAuth(config);

        try {
            const userCredential = await createUserWithEmailAndPassword(
                auth,
                email, 
                password
            );
            
            // Signed up on Firebase
            user = userCredential.user;
            const idToken = await user.getIdToken();
                    
            // Create the user profile; User Service emits UserCreated for async credit provisioning.
            const response = await fetch(`${config.apiBaseUrl}/api/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    username: username
                })
            });

            // Checks if API succeeded
            if (!response.ok) {
              let message = "Failed to create user profile.";

              try {
                const data = await response.json();
                message = data.message || message;
              } catch {
                // Response wasn't valid JSON
              }

              throw new Error(message);
            }
        } catch (error) {
            // Error happened
            // Did not go through, delete Firebase acc
            if (user) {
              try {
                console.log(`Deleting firebase user ${user.email}`);
                await user.delete();
              } catch (deleteError) {
                console.error("Failed to clean up Firebase user:", deleteError)
              }
            }

            // Log it in console
            console.error(error);

            // Continue throwing the error up
            if (error instanceof Error) {
              throw error;
            }

            throw new Error("Something went wrong during sign up. Try again later.");
        }

        try {
          await sendEmailVerification(user);
        
          console.log("Verification email sent");
        } catch (error) {
          console.error("Failed to send verification email:", error)
          throw new Error(
              "Your account was created, but we couldn't send the verification email. Please try resending it."
          )
        } finally {
          await firebaseSignOut(auth);
        }
    },
    [config],
  )

  const signOut = useCallback(async () => {
    profileUidRef.current = null
    profileRequestIdRef.current++

    setUser(null)
    setProfile(null)
    setProfileLoading(false)

    await firebaseSignOut(getFirebaseAuth(config))
  }, [config])

  // Firebase refreshes the ID token automatically when it is close to expiry.
  // By default, refresh is not enforced and will be done close to expiry
  // Can force this refresh when email changes
  const getIdToken = useCallback(async (forceRefresh = false) => {
    const current = getFirebaseAuth(config).currentUser
    return current ? current.getIdToken(forceRefresh) : null
  }, [config])

  const resendVerificationEmail = useCallback(async (email: string, password: string) => {
      const auth = getFirebaseAuth(config)

      // Sign in temporarily so Firebase can send the verification email.
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      )

      try {
        if (credential.user.emailVerified) {
          throw new Error("EMAIL_ALREADY_VERIFIED")
        }

        await sendEmailVerification(credential.user)
      } finally {
        // Sign out unverified user
        await firebaseSignOut(auth)
      }
    },
    [config]
  )

  const sendFirebasePasswordResetEmail = useCallback(async (email: string) => {
      const auth = getFirebaseAuth(config)
      await sendPasswordResetEmail(auth, email.trim())
    },
    [config]
  )

  const value = useMemo(
    () => ({ user, loading, profile, profileLoading, profileError, refreshProfile, 
      signIn, signUp, signOut, getIdToken, resendVerificationEmail, sendFirebasePasswordResetEmail }),
    [user, loading, profile, profileLoading, profileError, refreshProfile, 
      signIn, signUp, signOut, getIdToken, resendVerificationEmail, sendFirebasePasswordResetEmail],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>")
  return value
}
