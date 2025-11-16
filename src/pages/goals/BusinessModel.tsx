import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ArrowLeft, TrendingUp, Target, Zap, ShoppingCart, Users, MapPin, Globe, Award, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

const BusinessModel = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4 pb-24 md:pb-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Business Model Education
            </h1>
            <p className="text-muted-foreground">
              Understanding the card trading business fundamentals
            </p>
          </div>
        </div>

        {/* Introduction */}
        <Card className="p-6 bg-white border-gray-200 shadow-md">
          <div className="flex items-start gap-4">
            <div className="bg-primary/10 p-3 rounded-lg shrink-0">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                The Card Trading Business
              </h2>
              <p className="text-gray-700 leading-relaxed">
                Card trading is a unique business that combines market knowledge, fast 
                inventory turnover, and efficient operations. Success comes from buying 
                undervalued cards, knowing your market, and selling at optimal prices. 
                Your goal is to maximize cash velocity—turning inventory into profit quickly.
              </p>
            </div>
          </div>
        </Card>

        {/* Revenue Streams */}
        <div>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-white" />
            Revenue Streams
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-6 bg-white border-gray-200 shadow-md hover:shadow-lg transition-all">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                  <Award className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Show Sales (Premium)</h3>
                  <p className="text-sm text-gray-700 mb-3">
                    Individual premium cards sold at shows. Higher margins but requires 
                    market expertise and customer interaction.
                  </p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Typical Margin:</span>
                      <span className="text-gray-900 font-semibold">30-100%+</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Volume:</span>
                      <span className="text-gray-900 font-semibold">Lower</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Time Investment:</span>
                      <span className="text-gray-900 font-semibold">High</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-white border-gray-200 shadow-md hover:shadow-lg transition-all">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                  <ShoppingCart className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Bulk Sales</h3>
                  <p className="text-sm text-gray-700 mb-3">
                    Selling multiple cards at once to dealers or collectors. Lower margins 
                    but faster cash conversion and less effort per sale.
                  </p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Typical Margin:</span>
                      <span className="text-gray-900 font-semibold">10-30%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Volume:</span>
                      <span className="text-gray-900 font-semibold">Higher</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Time Investment:</span>
                      <span className="text-gray-900 font-semibold">Low</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-white border-gray-200 shadow-md hover:shadow-lg transition-all md:col-span-2">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Online Sales</h3>
                  <p className="text-sm text-gray-700 mb-3">
                    eBay, Facebook Marketplace, COMC, and specialized card platforms. 
                    Expands reach beyond local market but requires shipping and platform management.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Typical Margin:</div>
                      <div className="text-gray-900 font-semibold">20-80%</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Volume:</div>
                      <div className="text-gray-900 font-semibold">Very High</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Time Investment:</div>
                      <div className="text-gray-900 font-semibold">Medium</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Platform Fees:</div>
                      <div className="text-gray-900 font-semibold">10-15%</div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Key Success Factors */}
        <div>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Target className="h-5 w-5 text-white" />
            Key Success Factors
          </h2>
          <div className="grid gap-4">
            <Card className="p-5 bg-white border-gray-200 shadow-md">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Buy Low, Sell High</h3>
              <p className="text-sm text-gray-700">
                Success starts with smart purchasing. Look for undervalued lots at estate sales, 
                storage auctions, and from casual collectors. The profit is made at the purchase, 
                not the sale. Target 50%+ margins on premium cards.
              </p>
            </Card>

            <Card className="p-5 bg-white border-gray-200 shadow-md">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Fast Inventory Turnover</h3>
              <p className="text-sm text-gray-700">
                Cash velocity matters more than holding for maximum profit. A 30% margin turned 
                monthly beats a 100% margin turned annually. Don&apos;t fall in love with inventory—
                move it quickly and reinvest.
              </p>
            </Card>

            <Card className="p-5 bg-white border-gray-200 shadow-md">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Market Knowledge</h3>
              <p className="text-sm text-gray-700">
                Know which players, years, and sets are valuable. Study recent sales on eBay, 
                monitor PSA/Beckett values, and understand what collectors want. Specialize in 
                specific eras or sports to build expertise faster.
              </p>
            </Card>

            <Card className="p-5 bg-white border-gray-200 shadow-md">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Efficient Operations</h3>
              <p className="text-sm text-gray-700">
                Time is money. Optimize your sorting, pricing, and selling processes. Use tools 
                like EndZone to track everything instantly. Know your numbers—cost basis, margins, 
                cash position—without digging through paperwork.
              </p>
            </Card>
          </div>
        </div>

        {/* Growth Levers */}
        <div>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-white" />
            Growth Levers
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5 bg-white border-gray-200 shadow-md">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Increase Show Frequency</h3>
                  <p className="text-sm text-gray-700">
                    More shows = more opportunities. Start with monthly shows, then bi-weekly, 
                    then weekly. Each show is a cash injection opportunity.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-5 bg-white border-gray-200 shadow-md">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Improve Average Sale Price</h3>
                  <p className="text-sm text-gray-700">
                    Focus on higher-value cards. A $200 average sale vs $50 means 4x fewer 
                    transactions for the same revenue.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-5 bg-white border-gray-200 shadow-md">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Expand Geographic Market</h3>
                  <p className="text-sm text-gray-700">
                    Travel to neighboring cities and states. Larger markets have more buyers 
                    and often higher prices for the same cards.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-5 bg-white border-gray-200 shadow-md">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Add Online Channels</h3>
                  <p className="text-sm text-gray-700">
                    Online sales expand your market to nationwide (or worldwide). Start simple 
                    with Facebook Marketplace, then add eBay.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-5 bg-white border-gray-200 shadow-md md:col-span-2">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                  <Award className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Specialize in High-Value Niches</h3>
                  <p className="text-sm text-gray-700">
                    Become THE expert in vintage baseball, rookie cards, graded cards, or a 
                    specific era. Specialists command premium prices and attract serious collectors.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Business Phases */}
        <div>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-white" />
            Typical Growth Phases
          </h2>
          <div className="space-y-4">
            <Card className="p-6 bg-white border-gray-200 shadow-md border-l-4 border-l-primary">
              <div className="flex items-start gap-4">
                <div className="bg-primary/10 p-2 rounded-lg shrink-0 text-primary font-bold">
                  1
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Part-Time Side Hustle</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    1-2 shows per month, evenings/weekends only. Goal: Supplement income while 
                    learning the business and building inventory.
                  </p>
                  <div className="text-sm text-gray-600 font-semibold">
                    Target: $500-2,000/month
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-white border-gray-200 shadow-md border-l-4 border-l-primary">
              <div className="flex items-start gap-4">
                <div className="bg-primary/10 p-2 rounded-lg shrink-0 text-primary font-bold">
                  2
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Serious Side Business</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    2-4 shows per month, dedicated business hours. Goal: Replace part of salary, 
                    build reputation, and test full-time viability.
                  </p>
                  <div className="text-sm text-gray-600 font-semibold">
                    Target: $2,000-5,000/month
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-white border-gray-200 shadow-md border-l-4 border-l-primary">
              <div className="flex items-start gap-4">
                <div className="bg-primary/10 p-2 rounded-lg shrink-0 text-primary font-bold">
                  3
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Full-Time Business</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    Weekly shows, online presence, established brand. Goal: Full financial 
                    independence with sustainable income and growth potential.
                  </p>
                  <div className="text-sm text-gray-600 font-semibold">
                    Target: $5,000-15,000+/month
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Next Steps */}
        <Card className="p-6 bg-white border-gray-200 shadow-md">
          <h3 className="text-lg font-bold text-gray-900 mb-3">Ready to Set Your Goals?</h3>
          <p className="text-sm text-gray-700 mb-4">
            Now that you understand the business model, define your personal and business goals 
            to create a roadmap for financial independence.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => navigate("/goals/personal")} variant="default">
              Set Personal Goals
            </Button>
            <Button onClick={() => navigate("/goals/business")} variant="outline">
              Set Business Goals
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default BusinessModel;
