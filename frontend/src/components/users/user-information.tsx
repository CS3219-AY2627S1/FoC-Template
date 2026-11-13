"use client" 

import { useAuth } from "@/components/providers/auth-provider" 
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert" 
import { Badge } from "@/components/ui/badge" 
import { Button } from "@/components/ui/button" 
import { Card, CardContent, CardDescription, CardHeader, CardTitle, } from "@/components/ui/card" 
import { Skeleton } from "@/components/ui/skeleton"


export function UserInformation() {
  const { user, profile, profileLoading, profileError, refreshProfile } = useAuth()
  
  if (profileLoading) { 
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            Profile summary
          </CardTitle>
          <CardDescription> 
            Your account details and courier standing. 
          </CardDescription> 
        </CardHeader> 
        <CardContent>
          <div aria-label="Loading profile" className="grid gap-4 sm:grid-cols-2" > 
            {[0, 1, 2, 3].map((item) => ( <Skeleton key={item} className="h-14 w-full" /> ))} 
          </div> 
        </CardContent> 
      </Card>
    ) 
  } 
  
  if (!user) { 
    return null 
  } 
  
  return ( 
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          Profile summary
        </CardTitle>
        <CardDescription> 
          Your account details and courier standing. 
        </CardDescription> 
      </CardHeader> 
      <CardContent> 
        {profileError && ( 
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Profile could not be loaded</AlertTitle> 
            <AlertDescription> Check your connection and try again.</AlertDescription> 
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2" 
              disabled={profileLoading} 
              onClick={() => void refreshProfile()} 
            >
              {profileLoading ? "Loading..." : "Try again"} 
            </Button>
          </Alert> 
        )} 
        
        {profile && (
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"> 
            <div> 
              <dt className="text-sm text-muted-foreground">Email</dt> 
              <dd className="mt-1 break-all font-medium"> {profile.email} </dd> 
            </div> 
            <div> 
              <dt className="text-sm text-muted-foreground">Roles</dt>
              <dd className="mt-1 flex flex-wrap gap-1"> 
              {(profile.roles ?? []).map((role) => ( 
                <Badge key={role} variant="secondary"> 
                  {role} 
                </Badge> ))} 
              </dd> 
            </div> 
            <div> 
              <dt className="text-sm text-muted-foreground"> 
                Courier status 
              </dt> 
              <dd className="mt-1"> 
                <Badge 
                  variant={ profile.isCourierSuspended ? "destructive" : "outline" } 
                > 
                  {profile.isCourierSuspended ? "Suspended" : "Active"} 
                </Badge> 
              </dd> 
            </div> 
            <div> 
              <dt className="text-sm text-muted-foreground">Penalty</dt> 
              <dd className="mt-1 font-medium"> 
                {profile.penalty} penalties 
              </dd> 
            </div> 
          </dl> 
        )} 
      </CardContent> 
    </Card> 
  )
}