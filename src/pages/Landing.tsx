import React from 'react';
import { Button } from '../components/ui/button';
import { motion } from 'motion/react';
import { Bot, Zap, Shield, Globe, Terminal, Cpu } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export const Landing: React.FC = () => {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const handleStart = () => {
    if (user) navigate('/dashboard');
    else login();
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="py-24 px-4 text-center bg-radial-[at_50%_-20%] from-primary/20 to-transparent">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
            <Zap className="w-3 h-3 text-primary animate-pulse" />
            <span>Botlaringiz uchun 24/7 Cloud Hosting</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent leading-tight">
            Botlaringizni <span className="text-primary">BotForge</span> bilan dunyoga taniting
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Telegram, Discord va boshqa botlarni soniyalar ichida yuklang, avtomatik tahlil qiling va 24/7 uzluksiz rejimda ishga tushiring.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button size="lg" onClick={handleStart} className="text-lg px-8 h-14 rounded-xl">
              Ishni Boshlash
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 h-14 rounded-xl">
              Qanday Ishlaydi?
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-20 container mx-auto px-4">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: <Terminal className="w-10 h-10 text-primary" />,
              title: "Ko'p tilli qo'llab-quvvatlash",
              desc: "Node.js, Python, Go, Rust va boshqa tillarda yozilgan botlarni muammosiz qo'llab-quvvatlaymiz."
            },
            {
              icon: <Shield className="w-10 h-10 text-primary" />,
              title: "Xavfsiz va Barqaror",
              desc: "Botlaringiz xavfsiz izolatsiyalangan muhitda ishlaydi va har doim onlayn bo'lishi kafolatlanadi."
            },
            {
              icon: <Cpu className="w-10 h-10 text-primary" />,
              title: "Avtomatik Deploy",
              desc: ".zip faylini yuklang, biz qolganini o'zimiz bajaramiz: dependency-larni o'rnatamiz va ishga tushiramiz."
            }
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="p-8 rounded-2xl border bg-card/50 hover:border-primary/50 transition-all hover:shadow-2xl hover:shadow-primary/5 group"
            >
              <div className="mb-4 p-3 bg-primary/5 rounded-xl inline-block group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Languages Section */}
      <section className="py-20 bg-card/30 border-y">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-12">Barcha ommabop tillar</h2>
          <div className="flex flex-wrap justify-center gap-12 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500">
             {/* Mock Icons/Text since no real SVGs requested */}
             {['Node.js', 'Python', 'Go', 'Rust', 'Ruby', 'PHP'].map(lang => (
               <div key={lang} className="text-2xl font-mono font-bold tracking-tighter">{lang}</div>
             ))}
          </div>
        </div>
      </section>


      {/* Footer */}
      <footer className="py-12 border-t mt-auto">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-xl text-primary">
            <Bot className="w-6 h-6" />
            <span>BotForge</span>
          </div>
          <p className="text-sm text-muted-foreground">© 2026 BotForge. Barcha huquqlar himoyalangan.</p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-primary">Shartlar</a>
            <a href="#" className="hover:text-primary">Maxfiylik</a>
            <a href="#" className="hover:text-primary">Kontakt</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
