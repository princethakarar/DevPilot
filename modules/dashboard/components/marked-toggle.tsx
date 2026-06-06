"use client"

import { Button } from "@/components/ui/button"

import { StarIcon, StarOffIcon } from "lucide-react"
import type React from "react"
import { useState, useEffect, forwardRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { toggleStarMarked } from "../actions"

interface MarkedToggleButtonProps extends React.ComponentPropsWithoutRef<typeof Button> {
  markedForRevision: boolean
  id: string
}

export const MarkedToggleButton = forwardRef<HTMLButtonElement, MarkedToggleButtonProps>(
  ({ markedForRevision, id, onClick, className, children, ...props }, ref) => {
    const [isMarked, setIsMarked] = useState(markedForRevision)
    const router = useRouter()

    useEffect(() => {
      setIsMarked(markedForRevision)
    }, [markedForRevision])

    const handleToggle = async (event: React.MouseEvent<HTMLButtonElement>) => {
      // Call the original onClick if provided by the parent (DropdownMenuItem)
      onClick?.(event)

      const newMarkedState = !isMarked
      setIsMarked(newMarkedState)

      try {
        const res = await toggleStarMarked(id, newMarkedState)
        const {success ,error , isMarked} = res;

    //    if ismarked true then show marked successfully otherwise show start over
        if (isMarked && !error && success) {
          toast.success("Added to Favorites successfully")
        } else {
          toast.success("Removed from Favorites successfully")
        }

        // Refresh server components so the sidebar updates in real-time
        router.refresh()

      } catch (error) {
        console.error("Failed to toggle mark for revision:", error)
        setIsMarked(!newMarkedState) // Revert state if the update fails
        // You might want to add a toast notification here for the user
      }
    }

    return (
      <Button
        ref={ref}
        variant="ghost"
        className={`flex items-center justify-start w-full px-2 py-1.5 text-[12px] font-jetbrains text-[#7ca8cc] hover:text-white rounded-md cursor-pointer hover:bg-[rgba(0,180,255,0.08)] transition-colors border-none bg-transparent ${className}`}
        onClick={handleToggle}
        {...props}
      >
        {isMarked ? (
          <StarIcon size={14} className="text-[#00CFFF] fill-[#00CFFF] mr-2" />
        ) : (
          <StarIcon size={14} className="text-[#3a6080] mr-2" />
        )}
        <span className="font-jetbrains text-[12px] text-[#7ca8cc] group-hover:text-white">{children || (isMarked ? "Remove Favorite" : "Add to Favorite")}</span>
      </Button>
    )
  },
)

MarkedToggleButton.displayName = "MarkedToggleButton"
