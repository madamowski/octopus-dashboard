import { Card, CardContent } from "@/components/ui/card";

function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card>
        <CardContent className="pt-6 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Welcome to your React Static App
          </h1>
          <p className="text-muted-foreground">Start building something amazing.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
