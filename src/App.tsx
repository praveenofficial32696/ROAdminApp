import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users,
  Search, 
  Bell,
  LogOut, 
  UserPlus, 
  CreditCard, 
  MessageSquarePlus, 
  Settings, 
  Calendar,
  X,
  Phone,
  MapPin,
  Info,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  ChevronRight,
  Plus,
  Loader2,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  Package,
  User
} from 'lucide-react';
import { 
  Booking, 
  AdminProfile, 
  ServiceStatus,
  ServiceType
} from './types';
import { INITIAL_TECHNICIANS, REGISTERED_CUSTOMERS } from './constants';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  where,
  limit,
  getDoc,
  setDoc,
  getDocs,
  getDocFromServer,
  runTransaction,
  Timestamp,
  serverTimestamp,
  deleteField,
  writeBatch
} from 'firebase/firestore';

// --- Components ---

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      let isFirestoreError = false;
      
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.operationType) {
            errorMessage = `Firestore Error: ${parsed.error} during ${parsed.operationType} on ${parsed.path}`;
            isFirestoreError = true;
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-[32px] shadow-2xl max-w-md w-full text-center border border-red-100">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
              <AlertTriangle size={40} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Oops!</h2>
            <p className="text-gray-600 mb-8 font-medium leading-relaxed">
              {errorMessage}
            </p>
            {isFirestoreError && (
              <p className="text-xs text-gray-400 mb-6 bg-gray-50 p-3 rounded-xl break-all font-mono">
                {this.state.error?.message}
              </p>
            )}
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-red-500 text-white font-bold rounded-full shadow-lg shadow-red-900/20 hover:bg-red-600 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const LoadingSpinner = () => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/60 backdrop-blur-[2px]">
    <motion.div 
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      className="text-blue-600"
    >
      <Loader2 className="w-10 h-10 md:w-12 lg:w-16" />
    </motion.div>
  </div>
);

const AlertPopup = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div 
      className={`fixed inset-0 z-[110] flex justify-center p-4 bg-black/5 ${
        type === 'success' ? 'items-start pt-[70vh]' : 'items-center'
      }`}
      onClick={onClose}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: -20 }}
        onClick={(e) => e.stopPropagation()}
        className={`px-6 md:px-8 py-3 md:py-4 rounded-2xl md:rounded-3xl shadow-2xl flex items-center gap-3 border ${
          type === 'success' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-red-500 text-white border-red-400'
        }`}
      >
        {type === 'success' ? <CheckCircle2 className="w-5 h-5 md:w-6" /> : <AlertTriangle className="w-5 h-5 md:w-6" />}
        <span className="font-bold text-base md:text-lg">{message}</span>
      </motion.div>
    </div>
  );
};

const Auth = ({ showAlert }: { 
  showAlert: (msg: string, type?: 'success' | 'error') => void
}) => {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [role, setRole] = useState<'admin' | 'customer'>('admin');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    const savedPass = localStorage.getItem('rememberedPassword');
    if (savedEmail) setEmail(savedEmail);
    if (savedPass) setPassword(savedPass);
  }, []);

  const validatePhone = (p: string) => p.length === 10 && /^\d+$/.test(p);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      if (isForgotPassword) {
        await sendPasswordResetEmail(auth, email);
        showAlert(`Password reset email has been sent to ${email}`, 'success');
        setIsForgotPassword(false);
        setIsLogin(true);
      } else if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        localStorage.setItem('rememberedEmail', email);
        localStorage.setItem('rememberedPassword', password);
        sessionStorage.setItem('justLoggedIn', 'true');
      } else {
        if (!validatePhone(phone)) {
          showAlert('Phone number must be exactly 10 digits.', 'error');
          setIsLoading(false);
          return;
        }
        
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          await updateProfile(userCredential.user, { displayName: name });
          
          // Save additional info to Firestore
          const userDocRef = doc(db, 'users', userCredential.user.uid);
          await setDoc(userDocRef, {
            name,
            email,
            phone,
            address: role === 'customer' ? address : '',
            role,
            createdAt: new Date().toISOString()
          });
          
          await signOut(auth);
          setIsLogin(true);
          localStorage.setItem('rememberedEmail', email);
          localStorage.setItem('rememberedPassword', password);
          showAlert('Account Created Successfully! Please login manually.', 'success');
        } catch (error: any) {
          if (error.code === 'auth/email-already-in-use') {
            try {
              const signInCred = await signInWithEmailAndPassword(auth, email, password);
              const userDocRef = doc(db, 'users', signInCred.user.uid);
              const userDoc = await getDoc(userDocRef);
              
              if (!userDoc.exists()) {
                await updateProfile(signInCred.user, { displayName: name });
                await setDoc(userDocRef, {
                  name,
                  email,
                  phone,
                  address: role === 'customer' ? address : '',
                  role,
                  createdAt: new Date().toISOString()
                });
                
                await signOut(auth);
                setIsLogin(true);
                localStorage.setItem('rememberedEmail', email);
                localStorage.setItem('rememberedPassword', password);
                showAlert('Account Re-registered Successfully! Please login manually.', 'success');
                return;
              } else {
                await signOut(auth);
                showAlert('Email already exists. Please use a different email.', 'error');
                setIsLoading(false);
                return;
              }
            } catch (signInError) {
              showAlert('Email already exists. Please use a different email.', 'error');
              setIsLoading(false);
              return;
            }
          }
          throw error;
        }
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      let message = "An error occurred during authentication.";
      if (error.code === 'auth/email-already-in-use') {
        message = 'Email already exists. Please use a different email.';
      } else if (error.code === 'auth/invalid-credential') {
        message = 'Invalid email or password.';
      } else if (error.code === 'auth/user-not-found') {
        message = 'User not found.';
      } else if (error.code === 'auth/wrong-password') {
        message = 'Incorrect password.';
      }
      showAlert(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f6f9fc] p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[36px] shadow-xl p-8 border border-gray-100"
      >
        <div className="text-center mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#0f2b4b] flex items-center justify-center gap-2">
            <span className="text-blue-600">⚡</span> Rhythm RO
          </h1>
          <p className="text-sm md:text-base text-gray-500 mt-2">
            {isForgotPassword ? 'Reset Password' : (isLogin ? 'Login to Dashboard' : 'Create Account')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
          <AnimatePresence mode="wait">
            {!isLogin && !isForgotPassword && (
              <motion.div
                key="signup-fields"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 md:space-y-4 overflow-hidden"
              >
                <input
                  type="text"
                  placeholder="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-5 md:px-6 py-3 md:py-4 rounded-full border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm md:text-base"
                  required={!isLogin}
                />
                <input
                  type="tel"
                  placeholder="Phone Number (10 digits)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="w-full px-5 md:px-6 py-3 md:py-4 rounded-full border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm md:text-base"
                  required={!isLogin}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 md:px-6 py-3 md:py-4 rounded-full border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm md:text-base"
              required
            />
          </div>
          {!isForgotPassword && (
            <div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 md:px-6 py-3 md:py-4 rounded-full border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm md:text-base"
                required
              />
            </div>
          )}
          
          {isLogin && !isForgotPassword && (
            <div className="text-right px-2">
              <button 
                type="button"
                onClick={() => setIsForgotPassword(true)}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <motion.button
            type="submit"
            disabled={isLoading}
            whileTap={{ scale: 0.95 }}
            className="w-full py-3 md:py-4 bg-[#2b6c9e] text-white font-bold rounded-full shadow-lg shadow-blue-900/20 hover:bg-[#1e4a6f] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm md:text-base"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : (isForgotPassword ? 'Send Reset Link' : (isLogin ? 'Login to Dashboard' : 'Create Account'))}
          </motion.button>
        </form>

        <p className="text-center mt-6 text-sm text-gray-600">
          {isForgotPassword ? (
            <button 
              type="button"
              onClick={() => setIsForgotPassword(false)}
              className="text-[#2b6c9e] font-semibold hover:underline"
            >
              Back to Login
            </button>
          ) : (
            <>
              {isLogin ? "New User? " : "Already have an account? "}
              <motion.button 
                type="button"
                disabled={isLoading}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setIsLogin(!isLogin);
                }}
                className="text-[#2b6c9e] font-semibold hover:underline disabled:opacity-50"
              >
                {isLogin ? 'Sign Up' : 'Login'}
              </motion.button>
            </>
          )}
        </p>
      </motion.div>
    </div>
  );
};

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="px-6 md:px-8 py-4 md:py-6 flex items-center justify-between border-b border-gray-50">
          <h3 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">{title}</h3>
          <motion.button 
            onClick={onClose} 
            whileTap={{ scale: 0.9 }}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-4 h-4 md:w-5 md:h-5" />
          </motion.button>
        </div>
        <div className="p-6 md:p-8 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

const CustomerDashboard = ({ 
  user, 
  bookings, 
  onLogout, 
  showAlert 
}: { 
  user: AdminProfile, 
  bookings: Booking[], 
  onLogout: () => void,
  showAlert: (msg: string, type?: 'success' | 'error') => void
}) => {
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    roModel: '',
    serviceType: 'service request' as Booking['serviceType']
  });

  const myBookings = bookings.filter(b => b.uid === user.uid);

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingForm.roModel || !bookingForm.serviceType) {
      showAlert('Please fill in all fields.', 'error');
      return;
    }
    setIsLoading(true);

    try {
      const counterRef = doc(db, 'counters', 'bookings');
      const newBookingId = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        if (!counterDoc.exists()) {
          transaction.set(counterRef, { count: 1 });
          return 'RHY0001';
        }
        const newCount = (counterDoc.data().count || 0) + 1;
        transaction.update(counterRef, { count: newCount });
        return `RHY${newCount.toString().padStart(4, '0')}`;
      });

      const newBooking: Omit<Booking, 'id'> = {
        customerName: user.name,
        customerNumber: user.phone,
        customerAddress: user.address || '',
        bookingId: newBookingId,
        bookedDate: serverTimestamp() as Timestamp,
        createdAt: serverTimestamp() as Timestamp,
        status: 'open',
        serviceType: bookingForm.serviceType,
        uid: user.uid,
        isComplaint: bookingForm.serviceType === 'complaint',
        roModel: bookingForm.roModel,
        technician: { name: '', phone: '' }
      };

      await setDoc(doc(db, 'bookings', newBookingId), newBooking);
      setShowBookingModal(false);
      setBookingForm({
        roModel: '',
        serviceType: 'service request'
      });
      showAlert(`Booking created successfully! ID: ${newBookingId}`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'bookings');
      showAlert('Failed to create booking.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <span className="font-bold text-xl">⚡</span>
            </div>
            <h1 className="text-xl font-bold text-slate-800 hidden sm:block">Rhythm RO</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-800">{user.name}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Customer</p>
            </div>
            <button 
              onClick={onLogout}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all rounded-full"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">My Bookings</h2>
            <p className="text-slate-500 text-sm">Manage your service requests and complaints</p>
          </div>
          <button 
            onClick={() => setShowBookingModal(true)}
            className="bg-blue-600 text-white px-6 py-3 rounded-full font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            New Booking
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {myBookings.length === 0 ? (
            <div className="col-span-full bg-white rounded-[32px] p-12 text-center border border-dashed border-slate-200">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="text-slate-300" size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">No bookings found</h3>
              <p className="text-slate-500 text-sm mb-6">You haven't made any service requests yet.</p>
              <button 
                onClick={() => setShowBookingModal(true)}
                className="text-blue-600 font-bold hover:underline"
              >
                Create your first booking
              </button>
            </div>
          ) : (
            myBookings.map(booking => (
              <motion.div 
                key={booking.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                    {booking.serviceType === 'complaint' ? <AlertCircle size={24} /> : <Wrench size={24} />}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    booking.status === 'closed' ? 'bg-green-100 text-green-600' :
                    booking.status === 'InProcess' ? 'bg-orange-100 text-orange-600' :
                    'bg-blue-100 text-blue-600'
                  }`}>
                    {booking.status}
                  </span>
                </div>
                <h4 className="font-bold text-slate-800 text-lg mb-1">{booking.bookingId}</h4>
                <p className="text-slate-500 text-xs mb-4">{booking.serviceType?.toUpperCase() ?? 'N/A'}</p>
                
                <div className="space-y-3 pt-4 border-t border-slate-50">
                  <div className="flex items-center gap-3 text-slate-600">
                    <Calendar size={14} className="text-slate-400" />
                    <span className="text-xs font-medium">
                      {booking.bookedDate?.toDate()?.toLocaleString() ?? 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-600">
                    <Package size={14} className="text-slate-400" />
                    <span className="text-xs font-medium">{booking.roModel}</span>
                  </div>
                  {booking.technician?.name && (
                    <div className="flex items-center gap-3 text-slate-600">
                      <User size={14} className="text-slate-400" />
                      <span className="text-xs font-medium">
                        Tech: {booking.technician.name} {booking.technician.phone ? `(${booking.technician.phone})` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </main>

      <AnimatePresence>
        {showBookingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-bold text-slate-800">New Booking</h3>
                  <button onClick={() => setShowBookingModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleCreateBooking} className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Service Type</label>
                    <div className="grid grid-cols-2 gap-3">
                      {['service request', 'complaint', 'installation', 'Reinstallation'].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setBookingForm(prev => ({ ...prev, serviceType: t as any }))}
                          className={`py-3 rounded-2xl text-xs font-bold transition-all border ${
                            bookingForm.serviceType === t 
                              ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' 
                              : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-blue-200'
                          }`}
                        >
                          {t.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">RO Model</label>
                    <input 
                      type="text"
                      placeholder="e.g. Kent Grand Plus"
                      value={bookingForm.roModel}
                      onChange={(e) => setBookingForm(prev => ({ ...prev, roModel: e.target.value }))}
                      className="w-full px-6 py-4 rounded-3xl bg-slate-50 border border-slate-100 outline-none focus:bg-white focus:border-blue-500 transition-all text-sm"
                      required
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 bg-blue-600 text-white font-bold rounded-full shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Confirm Booking'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

function App() {
  const [user, setUser] = useState<AdminProfile | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [technicians, setTechnicians] = useState<{ name: string, phone: string, uid: string }[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  
  // App states
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [alert, setAlert] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Profile Edit State (Isolated)
  const [tempProfileName, setTempProfileName] = useState('');
  const [tempProfileEmail, setTempProfileEmail] = useState('');
  const [tempProfilePhone, setTempProfilePhone] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentSearchQuery, setPaymentSearchQuery] = useState('');
  const [appliedPaymentSearchQuery, setAppliedPaymentSearchQuery] = useState('');

  // Modals
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | number | null>(null);
  const [selectedTech, setSelectedTech] = useState<{ name: string, phone: string, uid: string } | null>(null);
  const [complaintForm, setComplaintForm] = useState({
    customer: '',
    phone: '',
    address: '',
    roModel: '',
    service: '' as any
  });
  const [complaintError, setComplaintError] = useState('');

  // Derived data
  const filteredBySearch = bookings.filter(booking => {
    const matchesSearch = 
      (booking.customerName?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (booking.customerNumber || '').includes(searchQuery) ||
      (booking.bookingId?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const stats = {
    all: filteredBySearch.filter(b => ['open', 'inprocess', 'in process', 'closed', 'cancelled'].includes(b.status?.toLowerCase() || '')).length,
    open: filteredBySearch.filter(b => (b.status?.toLowerCase() || '') === 'open').length,
    process: filteredBySearch.filter(b => ['inprocess', 'in process'].includes(b.status?.toLowerCase() || '')).length,
    closed: filteredBySearch.filter(b => ['closed', 'cancelled'].includes(b.status?.toLowerCase() || '')).length
  };

  const filteredBookings = filteredBySearch.filter(booking => {
    const status = booking.status?.toLowerCase() || '';
    if (statusFilter === 'All') return ['open', 'inprocess', 'in process', 'closed', 'cancelled'].includes(status);
    if (statusFilter === 'Open') return status === 'open';
    if (statusFilter === 'In Process') return ['inprocess', 'in process'].includes(status);
    if (statusFilter === 'Closed') return status === 'closed' || status === 'cancelled';
    return true;
  });

  const filteredPaymentBookings = useMemo(() => {
    return bookings
      .filter(b => (b.status?.toLowerCase() || '') === 'closed')
      .filter(b => {
        const query = appliedPaymentSearchQuery.toLowerCase();
        const matches = !query || 
          (b.customerName || '').toLowerCase().includes(query) ||
          (b.bookingId || '').toLowerCase().includes(query) ||
          (b.customerNumber || '').includes(query);
        return matches;
      });
  }, [bookings, appliedPaymentSearchQuery]);

  const showAlert = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setAlert({ message, type });
  }, []);

  // Test Connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
          showAlert("Database connection error. Please check your configuration.", "error");
        }
      }
    }
    testConnection();
  }, [showAlert]);

  // Welcome Back Message
  useEffect(() => {
    if (user && sessionStorage.getItem('justLoggedIn') === 'true') {
      showAlert('Welcome Back!', 'success');
      sessionStorage.removeItem('justLoggedIn');
    }
  }, [user, showAlert]);

  // One-time Cleanup for Admin (Migration)
  useEffect(() => {
    if (user?.role === 'admin' && !sessionStorage.getItem('cleanup_done')) {
      const runCleanup = async () => {
        try {
          console.log('Starting data cleanup...');
          const batch = writeBatch(db);
          let count = 0;

          // 1. Delete 'date' field from all bookings
          const bookingsSnapshot = await getDocs(collection(db, 'bookings'));
          bookingsSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.date !== undefined) {
              batch.update(docSnap.ref, { date: deleteField() });
              count++;
            }
          });

          // 2. Delete all documents in 'workHistory' collection if it exists
          try {
            const workHistorySnapshot = await getDocs(collection(db, 'workHistory'));
            workHistorySnapshot.forEach((docSnap) => {
              batch.delete(docSnap.ref);
              count++;
            });
          } catch (e) {
            // Collection might not exist, ignore
          }

          if (count > 0) {
            await batch.commit();
            console.log(`Cleanup complete. ${count} operations performed.`);
          }
          sessionStorage.setItem('cleanup_done', 'true');
        } catch (error) {
          console.error('Cleanup failed:', error);
        }
      };
      runCleanup();
    }
  }, [user]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          let userDoc = await getDoc(userDocRef);
          
          // Retry logic for signup race condition
          if (!userDoc.exists()) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            userDoc = await getDoc(userDocRef);
          }

          if (userDoc.exists()) {
            const userData = userDoc.data() as AdminProfile;
            setUser({ ...userData, uid: firebaseUser.uid });
          } else {
            await signOut(auth);
            setUser(null);
            showAlert("User account does not exist. Please contact support.", "error");
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          await signOut(auth);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsAuthReady(true);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [showAlert]);

  // Firestore Listeners
  useEffect(() => {
    if (!user || !isAuthReady) return;

    let bookingsQuery = query(collection(db, 'bookings'), orderBy('bookedDate', 'desc'));
    if (user.role === 'technician') {
      bookingsQuery = query(collection(db, 'bookings'), where('technician.uid', '==', user.uid));
    }
    const unsubBookings = onSnapshot(bookingsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      // Sort client-side if needed
      if (user.role === 'technician') {
        data.sort((a: any, b: any) => {
          const dateA = a.bookedDate?.toDate?.() || a.bookedDate || new Date(0);
          const dateB = b.bookedDate?.toDate?.() || b.bookedDate || new Date(0);
          return (dateB as any) - (dateA as any);
        });
      }
      setBookings(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'bookings'));

    const unsubTechs = onSnapshot(query(collection(db, 'users'), where('role', '==', 'technician')), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ 
        uid: doc.id,
        name: doc.data().name, 
        phone: doc.data().phone || '' 
      }));
      setTechnicians(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    const unsubCustomers = onSnapshot(query(collection(db, 'users'), where('role', '==', 'customer')), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setCustomers(data.length > 0 ? data : REGISTERED_CUSTOMERS);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => {
      unsubBookings();
      unsubTechs();
      unsubCustomers();
    };
  }, [user, isAuthReady]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setShowLogoutConfirm(false);
      showAlert('Logged out successfully');
    } catch (error) {
      showAlert('Error logging out', 'error');
    }
  };

  const handleAssignTech = async (tech: { name: string, phone: string, uid: string }) => {
    if (!selectedBooking) return;
    setIsLoading(true);
    try {
      const bookingRef = doc(db, 'bookings', selectedBooking.id as string);
      await updateDoc(bookingRef, {
        technician: tech,
        status: 'InProcess'
      });
      showAlert('Technician assigned successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${selectedBooking.id}`);
    } finally {
      setIsLoading(false);
      setActiveModal(null);
    }
  };

  const handleRaiseComplaint = async () => {
    if (!complaintForm.phone) {
      setComplaintError('Phone number is mandatory');
      return;
    }
    if (complaintForm.phone.length !== 10) {
      setComplaintError('Phone number must be 10 digits');
      return;
    }
    setComplaintError('');
    setIsLoading(true);
    try {
      let newBookingId = '';
      
      await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, 'counters', 'bookings');
        const counterDoc = await transaction.get(counterRef);
        
        let nextNum = 1;
        if (counterDoc.exists()) {
          const currentVal = counterDoc.data().count;
          nextNum = (typeof currentVal === 'number' && !isNaN(currentVal)) ? currentVal + 1 : 1;
        }
        
        transaction.set(counterRef, { count: nextNum }, { merge: true });
        newBookingId = `RHY${nextNum.toString().padStart(4, '0')}`;
      });

      const newBooking = {
        customerName: complaintForm.customer || 'Anonymous',
        customerAddress: complaintForm.address || 'Complaint registered - address to be updated',
        customerNumber: complaintForm.phone,
        bookingId: newBookingId,
        bookedDate: serverTimestamp(),
        createdAt: serverTimestamp(),
        status: 'open',
        serviceType: complaintForm.service || 'Not specified',
        uid: auth.currentUser?.uid || '',
        isComplaint: true,
        roModel: complaintForm.roModel || 'Not specified',
        technician: { name: '', phone: '' }
      };
      
      await setDoc(doc(db, 'bookings', newBookingId), newBooking);
      showAlert('Complaint registered successfully');
      setComplaintForm({ customer: '', phone: '', address: '', roModel: '', service: '' as any });
      setActiveModal(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'bookings');
    } finally {
      setIsLoading(false);
    }
  };

  const simulateTechClose = async () => {
    if (!selectedJobId) {
      showAlert('Please select a job card first to simulate closing', 'error');
      return;
    }

    const jobToClose = bookings.find(b => b.id === selectedJobId && (b.status?.toLowerCase() || '') !== 'closed');

    if (!jobToClose) {
      showAlert('Selected job is already closed or not found', 'error');
      return;
    }

    setIsLoading(true);
    setShowCloseConfirm(false);
    
    try {
      const bookingRef = doc(db, 'bookings', jobToClose.id as string);
      await updateDoc(bookingRef, {
        status: 'closed',
        closedDate: serverTimestamp()
      });

      showAlert('Job closed successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${selectedJobId}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return (
    <>
      {isLoading && <LoadingSpinner />}
      <AnimatePresence>
        {alert && <AlertPopup message={alert.message} type={alert.type} onClose={() => setAlert(null)} />}
      </AnimatePresence>
      <Auth 
        showAlert={showAlert} 
      />
    </>
  );

  if (user.role === 'customer') {
    return (
      <>
        {isLoading && <LoadingSpinner />}
        <AnimatePresence>
          {alert && <AlertPopup message={alert.message} type={alert.type} onClose={() => setAlert(null)} />}
        </AnimatePresence>
        <CustomerDashboard 
          user={user} 
          bookings={bookings} 
          onLogout={handleLogout} 
          showAlert={showAlert}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f9fc] pb-12 font-sans text-[#1c2f41]">
      {isLoading && <LoadingSpinner />}
      <AnimatePresence>
        {alert && <AlertPopup message={alert.message} type={alert.type} onClose={() => setAlert(null)} />}
      </AnimatePresence>
      
      <header className="bg-[#0f2b4b] text-white pt-6 md:pt-8 pb-10 md:pb-12 px-4 md:px-6 rounded-b-[32px] md:rounded-b-[48px] shadow-2xl shadow-blue-900/20 mb-6 md:mb-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between bg-white/10 backdrop-blur-md p-3 md:p-4 px-5 md:px-6 rounded-2xl md:rounded-3xl border border-white/20 shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg md:text-xl shadow-inner">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg md:text-xl lg:text-2xl font-bold leading-tight">{user.name}</h2>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-1">
                    <p className="text-sm md:text-base opacity-80 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span> {user.email}
                    </p>
                    {user.phone && (
                      <p className="text-sm md:text-base opacity-80 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span> {user.phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <motion.button 
                onClick={() => {
                  setTempProfileName(user.name);
                  setTempProfileEmail(user.email);
                  setTempProfilePhone(user.phone);
                  setActiveModal('profile');
                }}
                whileTap={{ scale: 0.95 }}
                className="p-2 md:p-2.5 bg-black/20 rounded-full hover:bg-white/20 transition-all hover:rotate-90"
              >
                <Settings className="w-4 h-4 md:w-5 md:h-5" />
              </motion.button>
            </div>

            <div className="flex items-center gap-3 md:gap-4 bg-white/5 p-3 rounded-2xl md:rounded-3xl border border-white/10 justify-between md:justify-start overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-2 md:gap-4">
                {user.role === 'admin' && (
                  <>
                    <motion.button 
                      onClick={() => setActiveModal('complaint')}
                      whileTap={{ scale: 0.95 }}
                      className="flex flex-col md:flex-row items-center gap-1 md:gap-2 px-3 md:px-5 py-2 md:py-3 bg-white/10 rounded-xl md:rounded-2xl hover:bg-white/20 transition-all border border-white/15 group shrink-0"
                    >
                      <MessageSquarePlus className="w-4 h-4 md:w-5 md:h-5 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">Complaint</span>
                    </motion.button>
                    <motion.button 
                      onClick={() => setActiveModal('manageTech')}
                      whileTap={{ scale: 0.95 }}
                      className="flex flex-col md:flex-row items-center gap-1 md:gap-2 px-3 md:px-5 py-2 md:py-3 bg-white/10 rounded-xl md:rounded-2xl hover:bg-white/20 transition-all border border-white/15 group shrink-0"
                    >
                      <UserPlus className="w-4 h-4 md:w-5 md:h-5 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">Technicians</span>
                    </motion.button>
                    <motion.button 
                      onClick={() => setActiveModal('payments')}
                      whileTap={{ scale: 0.95 }}
                      className="flex flex-col md:flex-row items-center gap-1 md:gap-2 px-3 md:px-5 py-2 md:py-3 bg-white/10 rounded-xl md:rounded-2xl hover:bg-white/20 transition-all border border-white/15 group shrink-0"
                    >
                      <CreditCard className="w-4 h-4 md:w-5 md:h-5 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">Payments</span>
                    </motion.button>
                    <motion.button 
                      whileTap={{ scale: 0.95 }}
                      className="flex flex-col md:flex-row items-center gap-1 md:gap-2 px-3 md:px-5 py-2 md:py-3 bg-white/10 rounded-xl md:rounded-2xl hover:bg-white/20 transition-all border border-white/15 group shrink-0"
                    >
                      <Bell className="w-4 h-4 md:w-5 md:h-5 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">Alerts</span>
                    </motion.button>
                  </>
                )}
                {user.role === 'admin' && (
                  <motion.button 
                    onClick={() => setActiveModal('customers')}
                    whileTap={{ scale: 0.95 }}
                    className="flex flex-col md:flex-row items-center gap-1 md:gap-2 px-3 md:px-5 py-2 md:py-3 bg-white/10 rounded-xl md:rounded-2xl hover:bg-white/20 transition-all border border-white/15 group shrink-0"
                  >
                    <Users className="w-4 h-4 md:w-5 md:h-5 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">Users</span>
                  </motion.button>
                )}
              </div>
              <motion.button 
                onClick={() => setShowLogoutConfirm(true)}
                whileTap={{ scale: 0.95 }}
                className="flex flex-col md:flex-row items-center gap-1 md:gap-2 px-3 md:px-5 py-2 md:py-3 bg-red-500/20 text-red-200 rounded-xl md:rounded-2xl hover:bg-red-500/30 transition-all border border-red-500/20 group shrink-0"
              >
                <LogOut className="w-4 h-4 md:w-5 md:h-5 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">Logout</span>
              </motion.button>
            </div>
          </div>

          <div className="mt-8 md:mt-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-lg md:text-xl lg:text-2xl font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 md:w-6 md:h-6 text-blue-400" />
              Today's Bookings
            </h3>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 w-4 h-4 md:w-4.5 md:h-4.5" />
              <input 
                type="text" 
                id="dashboard-search-query"
                name="dashboard-search-query"
                autoComplete="off"
                placeholder="Search by ID, Name, Phone"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 md:pl-12 pr-10 py-3 md:py-3.5 bg-white/15 border border-white/20 rounded-full text-sm md:text-base outline-none focus:bg-white/25 transition-all placeholder:text-white/40 shadow-inner"
              />
              {searchQuery && (
                <motion.button 
                  onClick={() => setSearchQuery('')}
                  whileTap={{ scale: 0.9 }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6">
        {/* Filters */}
        <div className="mb-6 md:mb-8">
          <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl md:rounded-full p-1 shadow-lg flex items-center overflow-x-auto no-scrollbar">
            {(['All', 'Open', 'In Process', 'Closed'] as const).map((status) => (
              <motion.button
                key={status}
                onClick={() => setStatusFilter(status)}
                whileTap={{ scale: 0.95 }}
                className={`px-4 md:px-6 py-2 rounded-xl md:rounded-full text-xs md:text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-2 ${
                  statusFilter === status 
                    ? 'bg-[#0f2b4b] text-white shadow-md' 
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {status}
                <span className={`text-[9px] md:text-[10px] px-1.5 md:px-2 py-0.5 rounded-full ${
                  statusFilter === status ? 'bg-white/20' : 'bg-gray-100'
                }`}>
                  {status === 'All' ? stats.all : status === 'Open' ? stats.open : status === 'In Process' ? stats.process : stats.closed}
                </span>
              </motion.button>
            ))}
            <div className="ml-auto pr-2">
            </div>
          </div>
        </div>

        {/* Booking List */}
        <div className="space-y-3 md:space-y-4">
          <AnimatePresence mode="popLayout">
            {filteredBookings.length > 0 ? (
              filteredBookings.map((booking) => (
                <motion.div
                  key={booking.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => setSelectedJobId(booking.id === selectedJobId ? null : booking.id)}
                  className={`bg-white rounded-xl md:rounded-2xl p-3 md:p-4 shadow-sm border transition-all group cursor-pointer ${
                    selectedJobId === booking.id ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md bg-blue-50/30' : 'border-gray-100 hover:shadow-lg'
                  }`}
                >
                  <div className="flex justify-between items-start gap-4 mb-2 md:mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm md:text-base font-bold truncate">{booking.customerName ?? 'Anonymous'}</h4>
                        <motion.button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBooking(booking);
                            setActiveModal('details');
                          }}
                          whileTap={{ scale: 0.9 }}
                          className="text-blue-500 hover:scale-110 transition-transform"
                        >
                          <Info className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        </motion.button>
                        <span className={`text-[9px] md:text-[10px] font-bold px-2 md:px-2.5 py-0.5 md:py-1 rounded-full uppercase tracking-wider ${
                          (booking.status?.toLowerCase() || '') === 'open' ? 'bg-blue-50 text-blue-600' :
                          ['inprocess', 'in process'].includes(booking.status?.toLowerCase() || '') ? 'bg-amber-50 text-amber-600' :
                          'bg-emerald-50 text-emerald-600'
                        }`}>
                          {booking.status ?? 'open'}
                        </span>
                        {booking.isComplaint && (
                          <span className="flex items-center gap-1 bg-red-50 text-red-600 text-[10px] md:text-[11px] font-bold px-2 md:px-2.5 py-0.5 md:py-1 rounded-full uppercase tracking-wider">
                            <AlertTriangle className="w-2.5 h-2.5 md:w-3 md:h-3" /> Complaint
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        <p className="text-[11px] md:text-xs text-gray-400 flex items-center gap-1">
                          <Settings className="w-2.5 h-2.5 md:w-3 md:h-3" /> ID: {booking.bookingId ?? 'N/A'}
                        </p>
                        {/* Removed roModel display from Job Card */}
                        {/* Removed problemDescription */}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="bg-gray-100 text-[#0f2b4b] text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap">
                        {booking.serviceType ?? 'N/A'} | Booked: {booking.bookedDate?.toDate()?.toLocaleDateString('en-GB').replace(/\//g, '-') ?? 'N/A'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 mb-4 md:mb-5">
                    <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600 bg-gray-50/50 p-1.5 rounded-xl">
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                        <Phone className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      </div>
                      <motion.a 
                        href={`tel:${booking.customerNumber}`} 
                        onClick={(e) => e.stopPropagation()}
                        whileTap={{ scale: 0.95 }}
                        className="font-bold hover:text-blue-600 active:text-blue-800 transition-all inline-block"
                      >
                        {booking.customerNumber ?? 'N/A'}
                      </motion.a>
                    </div>
                    <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600 bg-gray-50/50 p-1.5 rounded-xl">
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                        <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      </div>
                      <motion.a 
                        href={`https://maps.google.com/?q=${encodeURIComponent(booking.customerAddress ?? '')}`} 
                        target="_blank" 
                        onClick={(e) => e.stopPropagation()}
                        whileTap={{ scale: 0.95 }}
                        className="truncate font-bold hover:text-blue-600 active:text-blue-800 transition-all inline-block max-w-full"
                      >
                        {booking.customerAddress ?? 'N/A'}
                      </motion.a>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 md:pt-4 border-t border-gray-50">
                    <div className="flex items-center gap-1.5 md:gap-2 text-[11px] md:text-xs text-gray-500">
                      <Wrench className="w-3.5 h-3.5 md:w-4 md:h-4 text-gray-400" />
                      Tech: <span className="font-bold text-gray-700">
                        {booking.technician?.name || '—'}
                      </span>
                    </div>
                    
                    {['closed', 'cancelled'].includes(booking.status?.toLowerCase() || '') ? (
                      booking.status?.toLowerCase() === 'closed' ? (
                        <div className="flex items-center gap-1 text-emerald-600 font-bold text-base md:text-lg">
                          <CreditCard size={16} className="text-emerald-500" /> + ₹{booking.billing?.totalAmount || 0}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-red-600 font-bold text-base md:text-lg">
                          <AlertCircle size={16} className="text-red-500" /> Cancelled
                        </div>
                      )
                    ) : (
                      <motion.button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBooking(booking);
                          setActiveModal('assign');
                        }}
                        whileTap={{ scale: 0.95 }}
                        className="px-5 md:px-6 py-2 md:py-2.5 border border-blue-500 text-blue-500 font-bold text-sm md:text-base rounded-full hover:bg-blue-500 hover:text-white transition-all"
                      >
                        {['inprocess', 'in process'].includes(booking.status?.toLowerCase() || '') ? 'Reassign' : 'Assign'}
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-16 md:py-20">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                  <Search className="w-8 h-8 md:w-10 md:h-10" />
                </div>
                <p className="text-sm md:text-base text-gray-400 font-medium">No bookings match your filters.</p>
              </div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-8 md:mt-12 text-center">
          <motion.button 
            disabled={isLoading}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (selectedJobId) {
                setShowCloseConfirm(true);
              } else {
                showAlert('Please select a job card first to simulate closing', 'error');
              }
            }}
            className={`inline-flex items-center gap-2 px-6 md:px-8 py-3 md:py-4 border-2 font-bold rounded-full transition-all disabled:opacity-50 text-xs md:text-sm ${
              selectedJobId 
                ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700' 
                : 'bg-white border-blue-200 text-blue-500 hover:bg-blue-50'
            }`}
          >
            <Settings className={`${isLoading ? "animate-spin" : "animate-spin-slow"} w-4 h-4 md:w-5 md:h-5`} />
            {selectedJobId ? 'Close Selected Job (Tech)' : 'Select a Job to Close'}
          </motion.button>
          {selectedJobId && (
            <p className="mt-3 text-[10px] md:text-xs text-blue-600 font-medium animate-pulse">
              Job selected! Click above to simulate technician closing it.
            </p>
          )}
        </div>
      </main>

      {/* Modals */}
      
      {/* Details Modal */}
      <Modal 
        isOpen={activeModal === 'details'} 
        onClose={() => setActiveModal(null)} 
        title="Job Details"
      >
        {selectedBooking && (
          <div className="space-y-3 md:space-y-4">
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div>
                <p className="text-[10px] md:text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Customer</p>
                <p className="text-sm md:text-base font-bold text-gray-900">{selectedBooking.customerName ?? 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] md:text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Booking ID</p>
                <p className="text-sm md:text-base font-bold text-gray-900">{selectedBooking.bookingId ?? 'N/A'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div>
                <p className="text-[10px] md:text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">RO Model</p>
                <p className="text-sm md:text-base font-bold text-gray-900">{selectedBooking.roModel || "Not available"}</p>
              </div>
              <div>
                <p className="text-[10px] md:text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Service Type</p>
                <p className="text-sm md:text-base font-bold text-gray-900">{selectedBooking.serviceType ?? 'N/A'}</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Service Title</p>
              <p className="text-xs md:text-sm text-gray-600 bg-gray-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-gray-100">
                {selectedBooking.billing?.serviceTitle || "Not available"}
              </p>
            </div>
            <hr className="border-gray-50" />
            <div className="space-y-3 md:space-y-4">
              <div>
                <p className="text-[10px] md:text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Service Comments</p>
                <p className="text-xs md:text-sm text-gray-600 bg-gray-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-gray-100">
                  {selectedBooking.billing?.serviceComments || "No comments"}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] md:text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Service Fee</p>
                  <p className="text-sm font-bold text-gray-900">₹{selectedBooking.billing?.serviceFee ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] md:text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Discount</p>
                  <p className="text-sm font-bold text-gray-900">₹{selectedBooking.billing?.discount ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] md:text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Total Amount</p>
                  <p className="text-sm font-bold text-blue-600">₹{selectedBooking.billing?.totalAmount ?? 0}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] md:text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Spare Parts</p>
                <div className="text-xs md:text-sm text-gray-600 bg-gray-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-gray-100">
                  {selectedBooking.billing?.spareParts && selectedBooking.billing.spareParts.length > 0 ? (
                    <ul className="space-y-1">
                      {selectedBooking.billing.spareParts.map((part, idx) => (
                        <li key={idx}>
                          {part.partName} — ₹{part.price}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "No spare parts added"
                  )}
                </div>
              </div>
              {selectedBooking.serviceType === 'Installation' && (
                <div>
                  <p className="text-[10px] md:text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Warranty Details</p>
                  <p className="text-xs md:text-sm text-gray-600 bg-gray-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-gray-100">
                    {selectedBooking.billing?.warranty?.fromDate && selectedBooking.billing?.warranty?.toDate ? (
                      `${selectedBooking.billing.warranty.fromDate} to ${selectedBooking.billing.warranty.toDate}`
                    ) : (
                      "No warranty"
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Assign Modal */}
      <Modal 
        isOpen={activeModal === 'assign'} 
        onClose={() => setActiveModal(null)} 
        title="Assign Technician"
      >
        <div className="space-y-4 md:space-y-6">
          <p className="text-sm md:text-base text-gray-600">
            Assign a technician for <span className="font-bold text-gray-900">{selectedBooking?.customerName}</span>
          </p>
          <div className="space-y-2">
            {technicians.map(tech => (
              <motion.button
                key={tech.uid}
                disabled={isLoading}
                onClick={() => setSelectedTech(tech)}
                whileTap={{ scale: 0.98 }}
                className={`w-full p-3 md:p-4 flex items-center justify-between rounded-xl md:rounded-2xl transition-all group disabled:opacity-50 ${
                  selectedTech?.uid === tech.uid ? 'bg-blue-500 text-white shadow-lg' : 'bg-gray-50 hover:bg-blue-50 hover:text-blue-600'
                }`}
              >
                <span className="text-sm md:text-base font-bold">{tech.name}</span>
                {selectedTech?.uid === tech.uid ? <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" /> : <ChevronRight className="text-gray-300 group-hover:text-blue-500 transition-colors w-4 h-4 md:w-4.5 md:h-4.5" />}
              </motion.button>
            ))}
          </div>
          <div className="flex gap-2 md:gap-3 pt-2">
            <motion.button 
              onClick={() => {
                setActiveModal(null);
                setSelectedTech(null);
              }}
              whileTap={{ scale: 0.95 }}
              className="flex-1 py-3 md:py-4 bg-gray-100 text-gray-600 text-sm md:text-base font-bold rounded-full hover:bg-gray-200 transition-all"
            >
              Cancel
            </motion.button>
            <motion.button 
              disabled={!selectedTech || isLoading}
              onClick={() => selectedTech && handleAssignTech(selectedTech)}
              whileTap={{ scale: 0.95 }}
              className={`flex-1 py-3 md:py-4 text-white text-sm md:text-base font-bold rounded-full transition-all flex items-center justify-center gap-2 ${
                !selectedTech || isLoading ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-900/20'
              }`}
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Assign'}
            </motion.button>
          </div>
        </div>
      </Modal>

      {/* Manage Technicians Modal */}
      <Modal 
        isOpen={activeModal === 'manageTech'} 
        onClose={() => setActiveModal(null)} 
        title="Manage Technicians"
      >
        <div className="space-y-4 md:space-y-6">
          <div className="space-y-2">
            {technicians.length > 0 ? (
              technicians.map((tech, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 md:p-4 bg-gray-50 rounded-xl md:rounded-2xl">
                  <span className="text-sm md:text-base font-bold text-gray-700">{tech.name}</span>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-400 py-4 text-sm">No registered technicians found.</p>
            )}
          </div>
        </div>
      </Modal>

      {/* Registered Customers Modal */}

      {/* Complaint Modal */}
      <Modal 
        isOpen={activeModal === 'complaint'} 
        onClose={() => {
          setActiveModal(null);
          setComplaintForm({ customer: '', phone: '', address: '', roModel: '', service: '' as any });
          setComplaintError('');
        }} 
        title="Register Complaint"
      >
        <div className="space-y-3 md:space-y-4">
          <div>
            <label className="block text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-1.5 md:mb-2">Customer Name</label>
            <input 
              type="text" 
              placeholder="Enter customer name"
              value={complaintForm.customer}
              onChange={(e) => {
                setComplaintForm(prev => ({ ...prev, customer: e.target.value }));
                if (complaintError) setComplaintError('');
              }}
              className="w-full px-5 md:px-6 py-3 md:py-4 rounded-full bg-gray-50 border border-gray-100 text-xs md:text-sm outline-none focus:bg-white focus:border-blue-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-1.5 md:mb-2">Phone Number <span className="text-red-500">*</span></label>
            <input 
              type="tel" 
              placeholder="Enter 10 digit phone number"
              value={complaintForm.phone}
              autoComplete="off"
              onChange={(e) => {
                setComplaintForm(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }));
                if (complaintError) setComplaintError('');
              }}
              className={`w-full px-5 md:px-6 py-3 md:py-4 rounded-full bg-gray-50 border ${complaintError && (!complaintForm.phone || complaintForm.phone.length !== 10) ? 'border-red-500' : 'border-gray-100'} text-xs md:text-sm outline-none focus:bg-white focus:border-blue-500 transition-all`}
              required
            />
            {complaintError && (
              <div className="mt-2 px-4 py-2 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600">
                <AlertTriangle size={14} />
                <p className="text-[10px] font-bold">{complaintError}</p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-1.5 md:mb-2">RO Model</label>
            <input 
              type="text" 
              placeholder="Enter RO model"
              value={complaintForm.roModel}
              onChange={(e) => {
                setComplaintForm(prev => ({ ...prev, roModel: e.target.value }));
                if (complaintError) setComplaintError('');
              }}
              className="w-full px-5 md:px-6 py-3 md:py-4 rounded-full bg-gray-50 border border-gray-100 text-xs md:text-sm outline-none focus:bg-white focus:border-blue-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-1.5 md:mb-2">Address</label>
            <textarea 
              placeholder="Enter customer address"
              value={complaintForm.address}
              onChange={(e) => {
                setComplaintForm(prev => ({ ...prev, address: e.target.value }));
                if (complaintError) setComplaintError('');
              }}
              className="w-full px-5 md:px-6 py-3 md:py-4 rounded-2xl bg-gray-50 border border-gray-100 text-xs md:text-sm outline-none focus:bg-white focus:border-blue-500 transition-all resize-none"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-1.5 md:mb-2">Service Type</label>
            <select 
              value={complaintForm.service}
              onChange={(e) => setComplaintForm(prev => ({ ...prev, service: e.target.value as ServiceType }))}
              className="w-full px-5 md:px-6 py-3 md:py-4 rounded-full bg-gray-50 border border-gray-100 text-xs md:text-sm outline-none focus:bg-white focus:border-blue-500 transition-all appearance-none"
            >
              <option value="" disabled>Select Service</option>
              <option value="Installation">Installation</option>
              <option value="Reinstallation">Reinstallation</option>
              <option value="Service Request">Service Request</option>
            </select>
          </div>
          <motion.button 
            disabled={isLoading}
            onClick={handleRaiseComplaint}
            whileTap={{ scale: 0.95 }}
            className="w-full py-3 md:py-4 bg-red-500 text-white text-sm md:text-base font-bold rounded-full shadow-lg shadow-red-900/20 hover:bg-red-600 transition-all mt-2 md:mt-4 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Raise Complaint'}
          </motion.button>
        </div>
      </Modal>

      {/* Payments Modal */}
      <Modal 
        isOpen={activeModal === 'payments'} 
        onClose={() => setActiveModal(null)} 
        title="Payment History"
      >
        <div className="space-y-3 md:space-y-4">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs md:text-sm font-bold text-gray-500 uppercase tracking-wider">Total Jobs: {filteredPaymentBookings.length}</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search by Name, ID, Phone"
                  value={paymentSearchQuery}
                  onChange={(e) => setPaymentSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 md:py-3 bg-gray-50 border border-gray-100 rounded-full text-xs md:text-sm outline-none focus:bg-white focus:border-blue-500 transition-all"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <motion.button 
                onClick={() => setAppliedPaymentSearchQuery(paymentSearchQuery)}
                whileTap={{ scale: 0.95 }}
                className="flex-1 py-2 bg-blue-500 text-white text-xs font-bold rounded-full hover:bg-blue-600 transition-all"
              >
                Apply
              </motion.button>
              <motion.button 
                onClick={() => {
                  setPaymentSearchQuery('');
                  setAppliedPaymentSearchQuery('');
                }}
                whileTap={{ scale: 0.95 }}
                className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-full hover:bg-gray-200 transition-all"
              >
                Clear
              </motion.button>
            </div>
          </div>
          <div className="space-y-3 md:space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            {filteredPaymentBookings.map(b => (
              <div key={b.id} className="p-4 md:p-5 bg-gray-50 rounded-2xl md:rounded-[24px] border border-gray-100 shadow-sm">
                <div className="flex justify-between items-start mb-2 md:mb-3">
                  <span className="text-[10px] md:text-[11px] font-bold bg-blue-100 text-blue-600 px-3 py-1 rounded-full uppercase tracking-wider">ID: {b.bookingId}</span>
                  <span className="text-[10px] md:text-[11px] font-bold bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full uppercase tracking-wider">Closed</span>
                </div>
                <div className="space-y-1 mb-3">
                  <p className="text-base md:text-lg font-bold text-gray-800">{b.customerName || 'Anonymous'}</p>
                  <p className="text-xs md:text-sm text-gray-500 flex items-center gap-2"><Phone size={14} className="text-gray-400" /> {b.customerNumber || 'N/A'}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-3 text-xs md:text-sm text-gray-500 border-t border-gray-100 pt-3">
                  <p className="flex items-center gap-2"><Calendar size={14} className="text-gray-400" /> <span className="text-gray-400">Closed:</span> <span className="text-gray-700 font-medium">{b.closedDate?.toDate()?.toLocaleDateString('en-GB').replace(/\//g, '-') ?? 'N/A'}</span></p>
                  <p className="flex items-center gap-2"><CreditCard size={14} className="text-gray-400" /> <span className="text-gray-400">Total:</span> <span className="text-gray-700 font-medium">{b.billing?.totalAmount ? `₹${b.billing.totalAmount}` : '-'}</span></p>
                  <p className="flex items-center gap-2"><CheckCircle2 size={14} className="text-gray-400" /> <span className="text-gray-400">Payment Method:</span> <span className="text-gray-700 font-medium">{b.billing?.paymentMethod || '-'}</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={activeModal === 'profile'} 
        onClose={() => {
          setActiveModal(null);
          setTempProfileName('');
          setTempProfileEmail('');
          setTempProfilePhone('');
        }} 
        title="Edit Profile"
      >
        <div className="space-y-3 md:space-y-4">
          <div>
            <label className="block text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-1.5 md:mb-2">Full Name</label>
            <input 
              type="text" 
              autoComplete="off"
              value={tempProfileName}
              onChange={(e) => setTempProfileName(e.target.value)}
              className="w-full px-5 md:px-6 py-3 md:py-4 rounded-full bg-gray-50 border border-gray-100 text-xs md:text-sm outline-none focus:bg-white focus:border-blue-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-1.5 md:mb-2">Phone Number</label>
            <input 
              type="tel" 
              autoComplete="off"
              value={tempProfilePhone}
              onChange={(e) => setTempProfilePhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="w-full px-5 md:px-6 py-3 md:py-4 rounded-full bg-gray-50 border border-gray-100 text-xs md:text-sm outline-none focus:bg-white focus:border-blue-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-1.5 md:mb-2">Email</label>
            <input 
              type="email" 
              autoComplete="off"
              value={tempProfileEmail}
              readOnly
              className="w-full px-5 md:px-6 py-3 md:py-4 rounded-full bg-gray-100 border border-gray-100 text-xs md:text-sm outline-none cursor-not-allowed opacity-70"
            />
          </div>
          <motion.button 
            disabled={isLoading}
            onClick={async () => {
              if (tempProfilePhone.length !== 10) {
                showAlert('Phone number must be 10 digits', 'error');
                return;
              }
              setIsLoading(true);
              try {
                const updatedProfile = {
                  ...user,
                  name: tempProfileName,
                  phone: tempProfilePhone
                };
                
                const userDocRef = doc(db, 'users', auth.currentUser?.uid || '');
                await updateDoc(userDocRef, {
                  name: tempProfileName,
                  phone: tempProfilePhone
                });
                
                if (auth.currentUser) {
                  await updateProfile(auth.currentUser, { displayName: tempProfileName });
                }

                setUser(updatedProfile as AdminProfile);
                setActiveModal(null);
                showAlert('Profile updated successfully');
              } catch (error) {
                handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser?.uid}`);
              } finally {
                setIsLoading(false);
              }
            }}
            whileTap={{ scale: 0.95 }}
            className="w-full py-3 md:py-4 bg-blue-500 text-white text-sm md:text-base font-bold rounded-full shadow-lg shadow-blue-900/20 hover:bg-blue-600 transition-all mt-2 md:mt-4 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin mx-auto" size={24} /> : 'Save Changes'}
          </motion.button>
        </div>
      </Modal>

      {/* Logout Confirmation */}
      <Modal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title="Confirm Logout"
      >
        <div className="text-center space-y-4 md:space-y-6">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500">
            <LogOut className="w-8 h-8 md:w-10 md:h-10" />
          </div>
          <p className="text-sm md:text-base text-gray-600 font-medium">Are you sure you want to logout from your session?</p>
          <div className="flex gap-2 md:gap-3">
            <motion.button 
              onClick={() => setShowLogoutConfirm(false)}
              whileTap={{ scale: 0.95 }}
              className="flex-1 py-3 md:py-4 bg-gray-100 text-gray-600 text-sm md:text-base font-bold rounded-full hover:bg-gray-200 transition-all"
            >
              Cancel
            </motion.button>
            <motion.button 
              onClick={handleLogout}
              whileTap={{ scale: 0.95 }}
              className="flex-1 py-3 md:py-4 bg-red-500 text-white text-sm md:text-base font-bold rounded-full shadow-lg shadow-red-900/20 hover:bg-red-600 transition-all"
            >
              Logout
            </motion.button>
          </div>
        </div>
      </Modal>

      {/* Close Job Confirmation */}
      <Modal
        isOpen={showCloseConfirm}
        onClose={() => setShowCloseConfirm(false)}
        title="Confirm Job Closure"
      >
        <div className="text-center space-y-4 md:space-y-6">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-blue-500">
            <Settings className="w-8 h-8 md:w-10 md:h-10 animate-spin-slow" />
          </div>
          <div className="space-y-2">
            <p className="text-sm md:text-base text-gray-600 font-medium">Are you sure you want to close this job card?</p>
            <p className="text-xs text-amber-600 font-bold uppercase tracking-wider bg-amber-50 py-1 px-3 rounded-full inline-block">Paid amount will be set to ₹0</p>
          </div>
          <div className="flex gap-2 md:gap-3">
            <motion.button 
              onClick={() => setShowCloseConfirm(false)}
              whileTap={{ scale: 0.95 }}
              className="flex-1 py-3 md:py-4 bg-gray-100 text-gray-600 text-sm md:text-base font-bold rounded-full hover:bg-gray-200 transition-all"
            >
              Cancel
            </motion.button>
            <motion.button 
              onClick={simulateTechClose}
              whileTap={{ scale: 0.95 }}
              className="flex-1 py-3 md:py-4 bg-blue-600 text-white text-sm md:text-base font-bold rounded-full shadow-lg shadow-blue-900/20 hover:bg-blue-700 transition-all"
            >
              Confirm Close
            </motion.button>
          </div>
        </div>
      </Modal>

      {/* Registered Customers Modal */}
      <Modal
        isOpen={activeModal === 'customers'}
        onClose={() => {
          setActiveModal(null);
          setCustomerSearchQuery('');
        }}
        title="Registered Customers"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-blue-50 p-4 rounded-2xl border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-xl text-white">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Total Registered</p>
                <p className="text-xl font-black text-blue-900">{customers.length}</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="tel"
              placeholder="Search by phone number..."
              value={customerSearchQuery}
              onChange={(e) => setCustomerSearchQuery(e.target.value.replace(/\D/g, ''))}
              className="w-full pl-11 pr-6 py-3 md:py-4 rounded-full bg-gray-50 border border-gray-100 text-xs md:text-sm outline-none focus:bg-white focus:border-blue-500 transition-all"
            />
          </div>

          <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
            {customers.filter(c => c.phone.includes(customerSearchQuery)).length > 0 ? (
              customers.filter(c => c.phone.includes(customerSearchQuery)).map((customer, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl hover:border-blue-200 hover:shadow-md transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-bold group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                      {customer.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{customer.name}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {customer.phone}
                      </p>
                    </div>
                  </div>
                  <motion.button 
                    onClick={() => {
                      setComplaintForm(prev => ({ ...prev, customer: customer.name, phone: customer.phone }));
                      setActiveModal('complaint');
                    }}
                    whileTap={{ scale: 0.9 }}
                    className="p-2 bg-gray-50 text-gray-400 rounded-xl hover:bg-blue-500 hover:text-white transition-all"
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                  </motion.button>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400 font-medium">No customers found</p>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Floating Scroll Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40">
        <motion.button 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          whileTap={{ scale: 0.9 }}
          className="w-12 h-12 bg-white text-[#0f2b4b] rounded-full shadow-xl flex items-center justify-center border border-gray-100 hover:bg-blue-50 hover:text-blue-600 transition-all"
        >
          <ChevronUp size={24} />
        </motion.button>
        <motion.button 
          onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
          whileTap={{ scale: 0.9 }}
          className="w-12 h-12 bg-[#0f2b4b] text-white rounded-full shadow-xl flex items-center justify-center hover:bg-blue-900 transition-all"
        >
          <ChevronDown size={24} />
        </motion.button>
      </div>
    </div>
  );
}

export default function WrappedApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
