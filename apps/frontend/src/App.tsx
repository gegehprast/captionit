import { Toaster } from "react-hot-toast"
import { CaptioningPage } from "./components/CaptioningPage"

export default function App() {
  return (
    <>
      <CaptioningPage />
      <Toaster
        position="top-right"
        containerStyle={{ top: "4.5rem" }}
        toastOptions={{
          style: {
            background: "#1f2937",
            color: "#f9fafb",
            border: "1px solid #374151",
          },
        }}
      />
    </>
  )
}
