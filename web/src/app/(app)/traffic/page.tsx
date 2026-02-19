import { Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function TrafficPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md border-[#2a2a3a] bg-[#16161f]">
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10">
            <Activity className="h-8 w-8 text-blue-400" />
          </div>
          <h1 className="text-xl font-semibold text-white">Traffic Monitor</h1>
          <p className="text-center text-sm text-gray-500">
            Real-time bandwidth monitoring and traffic analytics.
            <br />
            Coming in v0.2
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
