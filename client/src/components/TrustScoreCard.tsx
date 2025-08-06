import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Shield, CheckCircle, Clock, AlertTriangle } from "lucide-react";

interface TrustScoreCardProps {
  chittyIdCode: string;
  trustScore: number;
  trustLevel: string;
  verificationStatus: string;
}

export function TrustScoreCard({ chittyIdCode, trustScore, trustLevel, verificationStatus }: TrustScoreCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified': return 'bg-green-100 text-green-600';
      case 'pending': return 'bg-yellow-100 text-yellow-600';
      case 'rejected': return 'bg-red-100 text-red-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified': return <CheckCircle className="h-3 w-3" />;
      case 'pending': return <Clock className="h-3 w-3" />;
      case 'rejected': return <AlertTriangle className="h-3 w-3" />;
      default: return <Clock className="h-3 w-3" />;
    }
  };

  const getTrustScorePercentage = (score: number) => {
    return Math.min((score / 1000) * 100, 100);
  };

  const getTrustLevelColor = (level: string) => {
    switch (level) {
      case 'L0': return 'bg-slate-100 text-slate-600';
      case 'L1': return 'bg-blue-100 text-blue-600';
      case 'L2': return 'bg-green-100 text-green-600';
      case 'L3': return 'bg-purple-100 text-purple-600';
      case 'L4': return 'bg-orange-100 text-orange-600';
      case 'L5': return 'bg-red-100 text-red-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <Card className="overflow-hidden" data-testid="trust-score-card">
      <CardHeader className="chitty-gradient-soft">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-green-600" />
            <span>Your ChittyID</span>
          </CardTitle>
          <Badge 
            className={getStatusColor(verificationStatus)}
            data-testid="badge-verification-status"
          >
            {getStatusIcon(verificationStatus)}
            <span className="ml-1 capitalize">{verificationStatus}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-6">
          {/* ChittyID Code */}
          <div>
            <div className="text-sm text-slate-600 mb-1">ChittyID Code</div>
            <div className="text-2xl font-mono bg-gradient-to-r from-green-600 to-teal-600 bg-clip-text text-transparent font-bold" data-testid="text-chittyid-code">
              {chittyIdCode}
            </div>
          </div>

          {/* Trust Score */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Trust Score</span>
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-bold text-slate-900" data-testid="text-trust-score">{trustScore}</span>
                <span className="text-sm text-slate-500">/ 1000</span>
              </div>
            </div>
            <Progress 
              value={getTrustScorePercentage(trustScore)} 
              className="h-3"
              data-testid="progress-trust-score"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>Beginner</span>
              <span>Expert</span>
            </div>
          </div>

          {/* Trust Level */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Trust Level</span>
            <Badge 
              className={getTrustLevelColor(trustLevel)}
              data-testid="badge-trust-level"
            >
              {trustLevel}
            </Badge>
          </div>

          {/* Progress to Next Level */}
          {trustLevel !== 'L5' && (
            <div>
              <div className="text-sm text-slate-600 mb-2">Progress to Next Level</div>
              <div className="text-xs text-slate-500 mb-1">
                {trustLevel === 'L0' && 'Complete email and phone verification to reach L1'}
                {trustLevel === 'L1' && 'Add government ID verification to reach L2'}
                {trustLevel === 'L2' && 'Build transaction history to reach L3'}
              </div>
              <Progress 
                value={
                  trustLevel === 'L0' ? (trustScore / 200) * 100 :
                  trustLevel === 'L1' ? ((trustScore - 200) / 300) * 100 :
                  ((trustScore - 500) / 500) * 100
                } 
                className="h-2"
                data-testid="progress-next-level"
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
