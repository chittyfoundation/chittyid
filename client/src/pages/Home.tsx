import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { TrustScoreCard } from "@/components/TrustScoreCard";
import { VerificationSteps } from "@/components/VerificationSteps";
import { BusinessStats } from "@/components/BusinessStats";
import { Shield, Plus, CheckCircle, Clock, AlertCircle, QrCode, Share2, LogOut, Star, Lock, CreditCard } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function Home() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'verification' | 'business'>('overview');

  // Get user stats and ChittyID
  const { data: stats } = useQuery({
    queryKey: ['/api/stats'],
    enabled: !!user,
  });

  const { data: verifications } = useQuery({
    queryKey: ['/api/verifications'],
    enabled: !!user,
  });

  const createChittyIdMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/chittyid/create');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: "ChittyID Created",
        description: "Your ChittyID has been successfully created!",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to create ChittyID. Please try again.",
        variant: "destructive",
      });
    },
  });

  const addVerificationMutation = useMutation({
    mutationFn: async (data: { verificationType: string; metadata?: any }) => {
      const response = await apiRequest('POST', '/api/verifications', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/verifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: "Verification Added",
        description: "Your verification has been successfully added!",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add verification. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" data-testid="loading-screen">
        <div className="text-center">
          <div className="w-8 h-8 chitty-gradient-l2 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Shield className="text-white h-5 w-5" />
          </div>
          <div className="text-slate-600">Loading your ChittyID...</div>
        </div>
      </div>
    );
  }

  const hasChittyId = (user as any)?.chittyId;
  const trustScore = (stats as any)?.trustScore || 0;
  const trustLevel = (stats as any)?.trustLevel || 'L0';
  const verificationStatus = (stats as any)?.verificationStatus || 'pending';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 chitty-gradient-l2 rounded-lg flex items-center justify-center">
                <Shield className="text-white text-sm" />
              </div>
              <span className="text-xl font-bold text-slate-900" data-testid="text-logo">ChittyID</span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-slate-600" data-testid="text-welcome">
                Welcome, {(user as any)?.firstName || (user as any)?.email}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => window.location.href = '/api/logout'}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Tabs */}
        <div className="mb-8">
          <div className="flex space-x-8 border-b border-slate-200">
            {[
              { key: 'overview', label: 'Overview', icon: Shield, colorClass: 'identity-element' },
              { key: 'verification', label: 'Verification', icon: CheckCircle, colorClass: 'verify-element' },
              { key: 'business', label: 'Business Network', icon: Share2, colorClass: 'network-element' },
            ].map(({ key, label, icon: Icon, colorClass }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                className={`flex items-center space-x-2 pb-3 px-1 border-b-2 transition-colors ${
                  activeTab === key
                    ? `border-current ${colorClass}`
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
                data-testid={`tab-${key}`}
              >
                <Icon className="h-4 w-4" />
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {!hasChittyId ? (
              /* Create ChittyID */
              <Card data-testid="card-create-chittyid">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Shield className="h-5 w-5 identity-element" />
                    <span>Create Your ChittyID</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600 mb-6">
                    Start your verification journey by creating your unique ChittyID. This will be your trusted identity across our entire network.
                  </p>
                  <Button 
                    onClick={() => createChittyIdMutation.mutate()}
                    disabled={createChittyIdMutation.isPending}
                    data-testid="button-create-chittyid"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {createChittyIdMutation.isPending ? 'Creating...' : 'Create ChittyID'}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              /* ChittyID Dashboard */
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <TrustScoreCard
                    chittyIdCode={(user as any)?.chittyId?.chittyIdCode || 'Not Generated'}
                    trustScore={trustScore}
                    trustLevel={trustLevel}
                    verificationStatus={verificationStatus}
                  />
                  
                  <Card data-testid="card-quick-actions">
                    <CardHeader>
                      <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <Button variant="outline" className="h-20 flex-col network-element border-current" data-testid="button-share-chittyid">
                          <Share2 className="h-6 w-6 mb-2" />
                          Share ChittyID
                        </Button>
                        <Button variant="outline" className="h-20 flex-col identity-element border-current" data-testid="button-qr-code">
                          <QrCode className="h-6 w-6 mb-2" />
                          QR Code
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* Component Color Showcase */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Trust Element */}
                    <Card data-testid="card-trust-element">
                      <CardHeader className="trust-bg">
                        <CardTitle className="flex items-center space-x-2 text-white">
                          <Shield className="h-5 w-5" />
                          <span>Trust</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-center">
                          <span className="trust-element font-semibold">Trust Building</span>
                          <span className="text-slate-600">85%</span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Verify Element */}
                    <Card data-testid="card-verify-element">
                      <CardHeader className="verify-bg">
                        <CardTitle className="flex items-center space-x-2 text-white">
                          <CheckCircle className="h-5 w-5" />
                          <span>Verify</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-center">
                          <span className="verify-element font-semibold">Verifications</span>
                          <span className="text-slate-600">3/5</span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Asset Element */}
                    <Card data-testid="card-asset-element">
                      <CardHeader className="asset-bg">
                        <CardTitle className="flex items-center space-x-2 text-white">
                          <CreditCard className="h-5 w-5" />
                          <span>Assets</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-center">
                          <span className="asset-element font-semibold">Asset Value</span>
                          <span className="text-slate-600">$245K</span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Score Element */}
                    <Card data-testid="card-score-element">
                      <CardHeader className="score-bg">
                        <CardTitle className="flex items-center space-x-2 text-white">
                          <Star className="h-5 w-5" />
                          <span>Score</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-center">
                          <span className="score-element font-semibold">Credit Score</span>
                          <span className="text-slate-600">742</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                <div className="space-y-6">
                  <Card data-testid="card-verification-status">
                    <CardHeader>
                      <CardTitle className="text-lg">Verification Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {Array.isArray(verifications) ? verifications.map((verification: any, index: number) => (
                          <div key={verification.id} className="flex items-center justify-between" data-testid={`verification-${index}`}>
                            <div>
                              <div className="font-medium capitalize">
                                {verification.verificationType.replace('_', ' ')}
                              </div>
                              <div className="text-sm text-slate-600">
                                {new Date(verification.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                            <Badge
                              variant={verification.status === 'verified' ? 'default' : 'secondary'}
                              className={verification.status === 'verified' ? 'bg-green-100 text-green-600' : ''}
                            >
                              {verification.status === 'verified' ? (
                                <CheckCircle className="h-3 w-3 mr-1" />
                              ) : verification.status === 'pending' ? (
                                <Clock className="h-3 w-3 mr-1" />
                              ) : (
                                <AlertCircle className="h-3 w-3 mr-1" />
                              )}
                              {verification.status}
                            </Badge>
                          </div>
                        )) : null}
                        {(!Array.isArray(verifications) || verifications.length === 0) && (
                          <div className="text-center text-slate-500 py-4" data-testid="no-verifications">
                            No verifications yet
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-network-stats">
                    <CardHeader>
                      <CardTitle className="text-lg">Network Stats</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Business Partners</span>
                          <span className="font-semibold" data-testid="text-business-partners">{(stats as any)?.businessPartners || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Verifications</span>
                          <span className="font-semibold" data-testid="text-verification-count">{(stats as any)?.verificationCount || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Trust Level</span>
                          <Badge data-testid="badge-trust-level">{trustLevel}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'verification' && (
          <VerificationSteps
            hasChittyId={hasChittyId}
            verifications={Array.isArray(verifications) ? verifications : []}
            onAddVerification={(type, metadata) => addVerificationMutation.mutate({ verificationType: type, metadata })}
            isAddingVerification={addVerificationMutation.isPending}
            data-testid="verification-steps"
          />
        )}

        {activeTab === 'business' && (
          <BusinessStats data-testid="business-stats" />
        )}
      </div>
    </div>
  );
}
