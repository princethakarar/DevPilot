import SignInFormClient from '@/modules/auth/components/sign-in-form-client'
import React, { Suspense } from 'react'

const Page = () => {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-full"><span className="text-white">Loading...</span></div>}>
      <SignInFormClient />
    </Suspense>
  )
}

export default Page