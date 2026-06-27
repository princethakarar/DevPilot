import SignInFormClient from '@/modules/auth/components/sign-in-form-client'
import React, { Suspense } from 'react'

const Page = () => {
  return (
    <Suspense>
      <SignInFormClient />
    </Suspense>
  )
}

export default Page