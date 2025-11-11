import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const useAppStatus = () => {
  const [isActive, setIsActive] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 🧪 LOCALHOST: Permite testare cu ?force=true
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
      const urlParams = new URLSearchParams(window.location.search);
      const forceEnable = urlParams.get('force') === 'true';
      
      if (forceEnable) {
        console.log('🧪 TEST MODE: Registration forced ENABLED on localhost');
        setIsActive(true);
        setMessage('');
        setLoading(false);
        return;
      }
    }

    // 🌐 Citește din Firebase (production + localhost fără ?force=true)
    const docRef = doc(db, 'config', 'appStatus');
    
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setIsActive(data?.isActive ?? false);
          setMessage(data?.message ?? '');
          console.log('📡 Firebase status:', data);
        } else {
          console.warn('⚠️ Firebase config not found');
          setIsActive(false);
          setMessage('Înregistrările sunt momentan închise.');
        }
        setLoading(false);
      },
      (error) => {
        console.error('❌ Error fetching status:', error);
        setIsActive(false);
        setMessage('Eroare la încărcarea configurației.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { isActive, message, loading };
};