/**
 * SVG Icon components using Lucide React
 * Re-exports commonly used icons with consistent sizing
 */

// Navigation
export { Home } from 'lucide-react';
export { Calendar } from 'lucide-react';
export { Edit3 as Compose } from 'lucide-react';
export { Image } from 'lucide-react';
export { BarChart3 as Analytics } from 'lucide-react';
export { Eye as Listening } from 'lucide-react';
export { Settings } from 'lucide-react';

// Actions
export { Plus } from 'lucide-react';
export { Search } from 'lucide-react';
export { ChevronDown } from 'lucide-react';
export { ChevronRight } from 'lucide-react';
export { ChevronLeft } from 'lucide-react';
export { X } from 'lucide-react';
export { MoreHorizontal } from 'lucide-react';
export { Check } from 'lucide-react';

// Status
export { AlertTriangle as Warning } from 'lucide-react';
export { AlertCircle as Error } from 'lucide-react';
export { CheckCircle as Success } from 'lucide-react';
export { Info } from 'lucide-react';
export { Loader2 as Spinner } from 'lucide-react';

// Social Platforms
export { Instagram } from 'lucide-react';
export { Facebook } from 'lucide-react';
export { Youtube } from 'lucide-react';

// Content
export { FileText } from 'lucide-react';
export { Upload } from 'lucide-react';
export { Download } from 'lucide-react';
export { Trash2 as Trash } from 'lucide-react';
export { Copy } from 'lucide-react';
export { ExternalLink } from 'lucide-react';

// UI Elements
export { Sun } from 'lucide-react';
export { Moon } from 'lucide-react';
export { User } from 'lucide-react';
export { LogOut } from 'lucide-react';
export { Bell } from 'lucide-react';
export { Zap } from 'lucide-react';
export { Star } from 'lucide-react';
export { Heart } from 'lucide-react';
export { MessageCircle } from 'lucide-react';
export { Send } from 'lucide-react';
export { Clock } from 'lucide-react';
export { Filter } from 'lucide-react';

// Media
export { Play } from 'lucide-react';
export { Pause } from 'lucide-react';
export { Volume2 as Volume } from 'lucide-react';
export { VolumeX as Mute } from 'lucide-react';
export { Maximize } from 'lucide-react';

// Misc
export { RefreshCw as Refresh } from 'lucide-react';
export { ArrowUp } from 'lucide-react';
export { ArrowDown } from 'lucide-react';
export { DollarSign } from 'lucide-react';
export { TrendingUp } from 'lucide-react';
export { TrendingDown } from 'lucide-react';
export { Command } from 'lucide-react';
export { Sparkles } from 'lucide-react';

// Platform icon map
import {
    Instagram as InstagramIcon,
    Facebook as FacebookIcon,
    Youtube as YoutubeIcon,
    type LucideIcon,
} from 'lucide-react';

export const platformIcons: Record<string, LucideIcon> = {
    INSTAGRAM: InstagramIcon,
    FACEBOOK: FacebookIcon,
    YOUTUBE: YoutubeIcon,
};
