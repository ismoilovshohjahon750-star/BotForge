import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui/button';
import { Bot, LogOut, LayoutDashboard, ShieldCheck, Menu, X, Coins, LogIn, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LogoFull } from './Logo';
import { NotificationBell } from './NotificationBell';

export const Navbar: React.FC = () => {
  const { user, isAdmin, logout, login } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  const handleLogout = async () => {
    closeMenu();
    await logout();
    navigate('/');
  };

  const handleLogin = async () => {
    closeMenu();
    await login();
  };

  return (
    <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" onClick={closeMenu} className="flex items-center z-50 hover:opacity-90 transition-opacity">
          <LogoFull size={26} showSub={false} />
        </Link>

        {/* Desktop Links (Hidden on mobile/tablet) */}
        <div className="hidden md:flex items-center gap-5 lg:gap-6">
          {user && <NotificationBell />}

          <Link to="/pricing" className="text-sm font-medium hover:text-primary transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <Coins className="w-4 h-4 text-primary shrink-0" />
            <span className="whitespace-nowrap">Narxlar</span>
          </Link>

          <Link to="/botly-ai" className="text-sm font-medium hover:text-primary transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <Bot className="w-4 h-4 text-primary shrink-0" />
            <span className="whitespace-nowrap">Botly AI</span>
          </Link>
          
          {user ? (
            <div className="flex items-center gap-4">
              <Link to="/dashboard" className="text-sm font-medium hover:text-primary transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0">
                <LayoutDashboard className="w-4 h-4 text-primary shrink-0" />
                <span className="whitespace-nowrap">Panel</span>
              </Link>
              <Link to="/messages" className="text-sm font-medium hover:text-primary transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0">
                <MessageSquare className="w-4 h-4 text-primary shrink-0" />
                <span className="whitespace-nowrap">Xabarlar</span>
              </Link>
              {isAdmin && (
                <Link to="/admin" className="text-sm font-medium hover:text-amber-500 transition-all flex items-center gap-1.5 text-amber-500 whitespace-nowrap shrink-0">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">Admin</span>
                </Link>
              )}
              <Button variant="ghost" size="icon" onClick={() => logout()} className="hover:bg-destructive/10 hover:text-destructive shrink-0" title="Chiqish">
                <LogOut className="w-4 h-4 shrink-0" />
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => navigate('/auth')} className="rounded-xl px-5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-bold shadow-md hover:shadow-green-500/20 whitespace-nowrap shrink-0">
              Kirish
            </Button>
          )}
        </div>

        {/* Right side controls for mobile/tablet */}
        <div className="md:hidden flex items-center gap-2 z-50">
          <NotificationBell />
          <button
            onClick={toggleMenu}
            className="p-2 rounded-xl border bg-card hover:bg-primary/10 transition-all text-foreground focus:outline-none"
            aria-label="Menyuni ochish/yopish"
          >
            {isOpen ? <X className="w-6 h-6 text-primary transition-transform duration-300 rotate-90" /> : <Menu className="w-6 h-6 text-foreground transition-transform duration-300" />}
          </button>
        </div>
      </div>

      {/* Mobile/Tablet Drawer Menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={closeMenu}
              className="fixed inset-0 top-16 bg-black z-40 md:hidden"
            />

            <motion.div
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="absolute top-16 left-0 right-0 border-b bg-card shadow-2xl z-40 md:hidden overflow-hidden"
            >
              <div className="p-4 flex flex-col gap-1 bg-card/95 backdrop-blur-md">
                <Link
                  to="/pricing"
                  onClick={closeMenu}
                  className="flex items-center gap-3 py-3 px-4 rounded-lg hover:bg-slate-800/40 text-foreground hover:text-primary transition-all text-sm font-medium"
                >
                  <Coins className="w-4 h-4 text-primary" />
                  <span>Narxlar</span>
                </Link>

                <Link
                  to="/botly-ai"
                  onClick={closeMenu}
                  className="flex items-center gap-3 py-3 px-4 rounded-lg hover:bg-slate-800/40 text-foreground hover:text-primary transition-all text-sm font-medium"
                >
                  <Bot className="w-4 h-4 text-primary" />
                  <span>Botly AI</span>
                </Link>

                {user ? (
                  <>
                    <Link
                      to="/dashboard"
                      onClick={closeMenu}
                      className="flex items-center gap-3 py-3 px-4 rounded-lg hover:bg-slate-800/40 text-foreground hover:text-primary transition-all text-sm font-medium"
                    >
                      <LayoutDashboard className="w-4 h-4 text-primary" />
                      <span>Dashboard Panel</span>
                    </Link>

                    <Link
                      to="/messages"
                      onClick={closeMenu}
                      className="flex items-center gap-3 py-3 px-4 rounded-lg hover:bg-slate-800/40 text-foreground hover:text-primary transition-all text-sm font-medium"
                    >
                      <MessageSquare className="w-4 h-4 text-primary" />
                      <span>Xabarlar</span>
                    </Link>

                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={closeMenu}
                        className="flex items-center gap-3 py-3 px-4 rounded-lg hover:bg-amber-500/10 text-amber-500 transition-all text-sm font-medium"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Admin Panel</span>
                      </Link>
                    )}

                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 py-3 px-4 rounded-lg hover:bg-destructive/10 text-destructive transition-all text-sm font-medium text-left w-full cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Chiqish</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { closeMenu(); navigate('/auth'); }}
                    className="flex items-center gap-3 py-3 px-4 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white transition-all text-sm font-bold w-full justify-center cursor-pointer mt-2"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Kirish</span>
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
};

